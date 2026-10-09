import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { pool } from './client.js';
import { logger } from '../middleware/logger.js';

export interface MeetingRecord {
  id: number;
  code: string;
  state: MeetingState;
  stateVersion: number;
}

/**
 * Fields a live meeting saved by an earlier version may still carry, of features since removed:
 * member-to-member proxies (the chair now enters the proxies held, `proxiesHeld`), rule
 * suspensions, the tabled and divided questions of motions Robbie no longer has, the roll call of
 * attendance and committee reports. Nothing reads them; they are dropped on load, so they are
 * never published to clients or written back.
 */
export const RETIRED_STATE_KEYS: readonly string[] = [
  'allowProxyVoting',
  'maxProxiesPerMember',
  'proxiesCountForQuorum',
  'proxies',
  'proxyVotes',
  'allowMemberProxyGrant',
  'pendingProxyRequests',
  'suspendedRules',
  'tabledMotions',
  'dividedQuestionParts',
  'rollCall',
  'committeeReports',
];

/**
 * A stored state with every field the current MeetingState has, and none it no longer has: a
 * meeting saved before a field existed gets its initial value, and a retired field is dropped
 */
export function withDefaults(state: MeetingState): MeetingState {
  const loaded: Record<string, unknown> = { ...initialState, ...state };
  for (const key of RETIRED_STATE_KEYS) delete loaded[key];
  return loaded as unknown as MeetingState;
}

/** Result of state update with optimistic locking */
export type UpdateResult =
  { success: true } | { success: false; error: 'VERSION_CONFLICT' | 'NOT_FOUND' };

/** How an update is written */
export interface UpdateOptions {
  /**
   * Keep the new state in memory and write it within FLUSH_DELAY_MS, with whatever follows it
   * (a vote in progress, a member arriving): the next write that isn't deferred, or the flush,
   * carries it to the database
   */
  defer?: boolean;
}

/**
 * The longest a deferred state waits in memory before it is written. A crash in that window
 * loses it; a shutdown writes it first (flushAll).
 */
export const FLUSH_DELAY_MS = 250;
/** After a failed flush (the database away), the next try */
const FLUSH_RETRY_MS = 2000;
/** A meeting nobody has read or written for this long leaves memory (it stays in the table) */
const IDLE_MS = 30 * 60 * 1000;

/**
 * The live meetings' storage: the `meetings` table (the LiveMeeting model; its migration creates
 * it), read and written with SQL, and each meeting in use kept in memory.
 *
 * The server is one process, so the copy in memory is the meeting: actions read it there instead
 * of parsing the whole state from Postgres, and every change is written through, at once or (for
 * the deferred kinds) within FLUSH_DELAY_MS. A read that may follow a change made outside this
 * process (a join, a REST route, a test or the e2e harness clearing the table) checks the row's id
 * and version first, which costs a few bytes rather than the state.
 */
export interface StorageProvider {
  mode: 'postgresql';
  initialize(): Promise<void>;
  /** Write every deferred state, then close the pool */
  shutdown(): Promise<void>;
  /** The meeting with this code, created with the `initial` state if there is none */
  getOrCreateMeeting(code: string, initial: MeetingState): Promise<MeetingRecord>;
  /**
   * Update meeting state with optimistic locking
   * @param code - Meeting code
   * @param state - New state to persist
   * @param expectedVersion - Version we read before applying changes
   * @param newVersion - New version to set (typically expectedVersion + 1)
   * @returns Success or failure with conflict/not-found error
   */
  updateMeetingState(
    code: string,
    state: MeetingState,
    expectedVersion: number,
    newVersion: number,
    options?: UpdateOptions,
  ): Promise<UpdateResult>;
  /** The meeting as it is now, checked against the table (it may have changed outside) */
  getMeeting(code: string): Promise<MeetingRecord | null>;
  /**
   * The meeting as this process has it, without asking the database when it is in memory: for
   * the actions of a meeting in progress, whose writes all go through here
   */
  peekMeeting(code: string): Promise<MeetingRecord | null>;
  /**
   * Delete a meeting's live state: when its meeting is canceled, or a stored state is another
   * organization's
   * @returns whether there was one
   */
  deleteMeeting(code: string): Promise<boolean>;
  /** Write every deferred state now */
  flushAll(): Promise<void>;
  /** Forget what is in memory (tests that change the table behind the server's back) */
  forgetAll(): void;
}

/** A meeting in memory: the state, and what the table has */
interface LiveRecord extends MeetingRecord {
  /** The version the table holds; less than stateVersion while a deferred write waits */
  persistedVersion: number;
  flushTimer: ReturnType<typeof setTimeout> | null;
  lastUsed: number;
}

type Row = { id: number; code: string; current_state: MeetingState; state_version: number };

function toRecord(row: Row): LiveRecord {
  return {
    id: row.id,
    code: row.code,
    state: withDefaults(row.current_state),
    stateVersion: row.state_version,
    persistedVersion: row.state_version,
    flushTimer: null,
    lastUsed: Date.now(),
  };
}

function publicRecord(live: LiveRecord): MeetingRecord {
  return { id: live.id, code: live.code, state: live.state, stateVersion: live.stateVersion };
}

// PostgreSQL implementation
class PostgresStorage implements StorageProvider {
  mode = 'postgresql' as const;
  private live = new Map<string, LiveRecord>();
  /** Each meeting's database work, one at a time: writes, flushes, checks and loads */
  private chains = new Map<string, Promise<unknown>>();
  private sweep: ReturnType<typeof setInterval> | null = null;
  /** A flush failed and none has succeeded since: nothing is deferred until one does */
  private writesFailing = false;

  /** Check the table is there: the migrations make it (npm run db:deploy) */
  async initialize(): Promise<void> {
    try {
      await pool.query('SELECT 1 FROM meetings LIMIT 1');
    } catch (error) {
      logger.error({ err: error }, 'The live meetings table is missing: apply the migrations');
      throw error;
    }
    this.sweep = setInterval(() => this.forgetIdle(), 10 * 60 * 1000);
    this.sweep.unref();
  }

  /**
   * Run a meeting's database work after the work already queued for it. Two UPDATEs of one row
   * with `WHERE state_version = ...` must never race: the loser would look like a conflict, and
   * reloading would drop the deferred changes made meanwhile.
   */
  private serial<T>(code: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(code) ?? Promise.resolve();
    const run = previous.then(task);
    const tail = run.catch(() => undefined);
    this.chains.set(code, tail);
    void tail.then(() => {
      if (this.chains.get(code) === tail) this.chains.delete(code);
    });
    return run;
  }

  private async load(code: string): Promise<LiveRecord | null> {
    const result = await pool.query<Row>(
      `SELECT id, code, current_state, state_version FROM meetings WHERE code = $1`,
      [code],
    );
    this.drop(code);
    if (result.rows.length === 0) return null;
    const record = toRecord(result.rows[0]);
    this.live.set(code, record);
    return record;
  }

  /** Forget a meeting in memory (its deferred write, if any, with it) */
  private drop(code: string): void {
    const record = this.live.get(code);
    if (record?.flushTimer) clearTimeout(record.flushTimer);
    this.live.delete(code);
  }

  getOrCreateMeeting(code: string, initial: MeetingState): Promise<MeetingRecord> {
    return this.serial(code, async () => {
      const existing = await this.checked(code);
      if (existing) return publicRecord(existing);

      const newState = { ...initial, meetingCode: code };
      const result = await pool.query<Row>(
        `INSERT INTO meetings (code, current_state, state_version)
         VALUES ($1, $2, 1)
         ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
         RETURNING id, code, current_state, state_version`,
        [code, JSON.stringify(newState)],
      );
      logger.info({ code }, 'Created new meeting');
      const record = toRecord(result.rows[0]);
      this.live.set(code, record);
      return publicRecord(record);
    });
  }

  updateMeetingState(
    code: string,
    state: MeetingState,
    expectedVersion: number,
    newVersion: number,
    options: UpdateOptions = {},
  ): Promise<UpdateResult> {
    return this.serial(code, async () => {
      const record = this.live.get(code) ?? (await this.load(code));
      if (!record) return { success: false, error: 'NOT_FOUND' } as const;
      if (record.stateVersion !== expectedVersion) {
        return { success: false, error: 'VERSION_CONFLICT' } as const;
      }
      record.lastUsed = Date.now();

      if (options.defer && !this.writesFailing) {
        record.state = state;
        record.stateVersion = newVersion;
        this.scheduleFlush(code, record, FLUSH_DELAY_MS);
        return { success: true } as const;
      }

      // Written now, with every deferred change before it (the state includes them)
      const written = await this.write(code, record, state, newVersion);
      if (!written.success) return written;
      record.state = state;
      record.stateVersion = newVersion;
      return written;
    });
  }

  /**
   * Write a state over the version the table has. A row changed or deleted outside this process
   * is reloaded on the next read, and the change refused.
   */
  private async write(
    code: string,
    record: LiveRecord,
    state: MeetingState,
    version: number,
  ): Promise<UpdateResult> {
    const result = await pool.query(
      `UPDATE meetings SET current_state = $1, state_version = $2
       WHERE code = $3 AND id = $4 AND state_version = $5`,
      [JSON.stringify(state), version, code, record.id, record.persistedVersion],
    );
    if (result.rowCount === 0) {
      const row = (
        await pool.query<{ id: number; state_version: number }>(
          'SELECT id, state_version FROM meetings WHERE code = $1',
          [code],
        )
      ).rows[0];
      if (
        row &&
        row.id === record.id &&
        row.state_version > record.persistedVersion &&
        row.state_version <= record.stateVersion
      ) {
        // An earlier write of ours landed though its answer was lost (the connection dropped
        // after the commit): the table has one of the states this server holds. Carry on from it.
        record.persistedVersion = row.state_version;
        if (row.state_version === version) return this.written(record);
        return this.write(code, record, state, version);
      }
      if (record.stateVersion !== record.persistedVersion) {
        logger.warn(
          { code },
          'A live meeting changed outside the server: its unsaved changes are lost',
        );
      }
      this.drop(code);
      return { success: false, error: row ? 'VERSION_CONFLICT' : 'NOT_FOUND' };
    }
    record.persistedVersion = version;
    return this.written(record);
  }

  /** A write landed: nothing waits for the record, and deferring is safe again */
  private written(record: LiveRecord): UpdateResult {
    if (record.persistedVersion >= record.stateVersion && record.flushTimer) {
      clearTimeout(record.flushTimer);
      record.flushTimer = null;
    }
    this.writesFailing = false;
    return { success: true };
  }

  private scheduleFlush(code: string, record: LiveRecord, delayMs: number): void {
    if (record.flushTimer) return;
    const timer = setTimeout(() => {
      record.flushTimer = null;
      this.flush(code).catch((err) => logger.error({ err, code }, 'Failed to save a live meeting'));
    }, delayMs);
    // A pending flush doesn't keep the process alive; shutdown flushes what is left
    timer.unref?.();
    record.flushTimer = timer;
  }

  /** Write a meeting's deferred state, if it still has one */
  private flush(code: string): Promise<void> {
    return this.serial(code, async () => {
      const record = this.live.get(code);
      if (!record || record.stateVersion === record.persistedVersion) return;
      try {
        await this.write(code, record, record.state, record.stateVersion);
      } catch (error) {
        // The database is away: keep the state in memory and try again, and write every change
        // through meanwhile, so an action that can't be saved is refused rather than confirmed
        this.writesFailing = true;
        this.scheduleFlush(code, record, FLUSH_RETRY_MS);
        throw error;
      }
    });
  }

  /**
   * The meeting in memory if the table still has the same row at the version written last;
   * otherwise what the table has now (a row deleted or replaced outside this process)
   */
  private async checked(code: string): Promise<LiveRecord | null> {
    const record = this.live.get(code);
    if (!record) return this.load(code);
    const result = await pool.query<{ id: number; state_version: number }>(
      'SELECT id, state_version FROM meetings WHERE code = $1',
      [code],
    );
    const row = result.rows[0];
    if (row && row.id === record.id && row.state_version === record.persistedVersion) {
      record.lastUsed = Date.now();
      return record;
    }
    return this.load(code);
  }

  getMeeting(code: string): Promise<MeetingRecord | null> {
    return this.serial(code, async () => {
      const record = await this.checked(code);
      return record ? publicRecord(record) : null;
    });
  }

  async peekMeeting(code: string): Promise<MeetingRecord | null> {
    const record = this.live.get(code);
    if (record) {
      record.lastUsed = Date.now();
      return publicRecord(record);
    }
    return this.getMeeting(code);
  }

  deleteMeeting(code: string): Promise<boolean> {
    return this.serial(code, async () => {
      this.drop(code);
      const result = await pool.query('DELETE FROM meetings WHERE code = $1', [code]);
      return (result.rowCount ?? 0) > 0;
    });
  }

  async flushAll(): Promise<void> {
    const codes = [...this.live.values()]
      .filter((record) => record.stateVersion !== record.persistedVersion)
      .map((record) => record.code);
    const results = await Promise.allSettled(codes.map((code) => this.flush(code)));
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        logger.error(
          { err: result.reason, code: codes[i] },
          "Couldn't save a live meeting's last changes",
        );
      }
    });
  }

  forgetAll(): void {
    for (const code of [...this.live.keys()]) this.drop(code);
  }

  /** Let meetings nobody has used for a while leave memory, once they are saved */
  private forgetIdle(): void {
    const before = Date.now() - IDLE_MS;
    for (const record of [...this.live.values()]) {
      if (record.lastUsed < before && record.stateVersion === record.persistedVersion) {
        this.drop(record.code);
      }
    }
  }

  async shutdown(): Promise<void> {
    await this.flushAll();
    if (this.sweep) clearInterval(this.sweep);
    this.forgetAll();
  }
}

// Factory function
let storageInstance: StorageProvider | null = null;

export async function initializeStorage(): Promise<StorageProvider> {
  if (storageInstance) {
    return storageInstance;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set: the live meetings are kept in Postgres');
  }
  storageInstance = new PostgresStorage();

  await storageInstance.initialize();
  return storageInstance;
}

export function getStorage(): StorageProvider {
  if (!storageInstance) {
    throw new Error('Storage not initialized. Call initializeStorage() first.');
  }
  return storageInstance;
}

/** Write what is deferred and forget the meetings in memory; the pool is closed separately */
export async function shutdownStorage(): Promise<void> {
  if (storageInstance) {
    await storageInstance.shutdown();
    storageInstance = null;
  }
}
