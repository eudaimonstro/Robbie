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
 * A stored state with every field the current MeetingState has: a meeting saved before a
 * field existed gets its initial value
 */
export function withDefaults(state: MeetingState): MeetingState {
  return { ...initialState, ...state };
}

/** Result of state update with optimistic locking */
export type UpdateResult =
  { success: true } | { success: false; error: 'VERSION_CONFLICT' | 'NOT_FOUND' };

/**
 * The live meetings' storage: the `meetings` table (the LiveMeeting model; its migration creates
 * it), read and written with SQL
 */
export interface StorageProvider {
  mode: 'postgresql';
  initialize(): Promise<void>;
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
  ): Promise<UpdateResult>;
  getMeeting(code: string): Promise<MeetingRecord | null>;
  /**
   * Delete a meeting's live state: when its meeting is canceled, or a stored state is another
   * organization's
   * @returns whether there was one
   */
  deleteMeeting(code: string): Promise<boolean>;
}

// PostgreSQL implementation
class PostgresStorage implements StorageProvider {
  mode = 'postgresql' as const;

  /** Check the table is there: the migrations make it (npm run db:deploy) */
  async initialize(): Promise<void> {
    try {
      await pool.query('SELECT 1 FROM meetings LIMIT 1');
    } catch (error) {
      logger.error({ err: error }, 'The live meetings table is missing: apply the migrations');
      throw error;
    }
  }

  async getOrCreateMeeting(code: string, initial: MeetingState): Promise<MeetingRecord> {
    // Try to get existing meeting
    const existing = await this.getMeeting(code);
    if (existing) {
      return existing;
    }

    // Create new meeting
    const newState = { ...initial, meetingCode: code };
    const result = await pool.query(
      `INSERT INTO meetings (code, current_state, state_version)
       VALUES ($1, $2, 1)
       ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
       RETURNING id, code, current_state, state_version`,
      [code, JSON.stringify(newState)],
    );

    logger.info({ code }, 'Created new meeting');
    return {
      id: result.rows[0].id,
      code: result.rows[0].code,
      state: withDefaults(result.rows[0].current_state),
      stateVersion: result.rows[0].state_version,
    };
  }

  async updateMeetingState(
    code: string,
    state: MeetingState,
    expectedVersion: number,
    newVersion: number,
  ): Promise<UpdateResult> {
    // Optimistic locking: only update if version matches
    const result = await pool.query(
      `UPDATE meetings SET current_state = $1, state_version = $2
       WHERE code = $3 AND state_version = $4`,
      [JSON.stringify(state), newVersion, code, expectedVersion],
    );

    if (result.rowCount === 0) {
      // No rows updated - either not found or version mismatch
      const existing = await this.getMeeting(code);
      if (!existing) {
        return { success: false, error: 'NOT_FOUND' };
      }
      return { success: false, error: 'VERSION_CONFLICT' };
    }
    return { success: true };
  }

  async getMeeting(code: string): Promise<MeetingRecord | null> {
    const result = await pool.query(
      `SELECT id, code, current_state, state_version FROM meetings WHERE code = $1`,
      [code],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      id: result.rows[0].id,
      code: result.rows[0].code,
      state: withDefaults(result.rows[0].current_state),
      stateVersion: result.rows[0].state_version,
    };
  }

  async deleteMeeting(code: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM meetings WHERE code = $1', [code]);
    return (result.rowCount ?? 0) > 0;
  }

  async shutdown(): Promise<void> {
    logger.info('Closing PostgreSQL connections');
    await pool.end();
    logger.info('PostgreSQL connections closed');
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

export async function shutdownStorage(): Promise<void> {
  if (storageInstance) {
    await storageInstance.shutdown();
    storageInstance = null;
  }
}
