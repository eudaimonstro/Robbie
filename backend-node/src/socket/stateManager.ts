import type { MeetingState, MeetingAction } from '@robbie-bylawyer/shared/types';
import type { ActionErrorCode } from '@robbie-bylawyer/shared/types/socket';
import { meetingReducer } from '@robbie-bylawyer/shared/reducer';
import { getStorage } from '../db/meetingStorage.js';
import { logger } from '../middleware/logger.js';

/** Validation result for action pre-checks */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: ActionErrorCode;
}

/** Optional validator function type */
export type ActionValidator = (state: MeetingState, action: MeetingAction) => ValidationResult;

/** Discriminated union for action result - ensures state/version exist when success is true */
export type ApplyActionResult =
  | {
      success: true;
      state: MeetingState;
      stateVersion: number;
      /** The state the action was applied to (in the meeting's queue, so after any before it) */
      previousState: MeetingState;
      /**
       * Whether the action changed anything. One that didn't (a device reconnecting for a member
       * already present, say) keeps the version, writes nothing and needs no broadcast.
       */
      changed: boolean;
    }
  | {
      success: false;
      error: string;
      errorCode?: 'CONCURRENCY_CONFLICT' | 'MEETING_NOT_FOUND' | ActionErrorCode;
    };

/** Maximum number of retry attempts for concurrent conflicts */
const MAX_RETRIES = 3;

/**
 * The actions whose state may wait in memory for up to FLUSH_DELAY_MS (meetingStorage) before it
 * is written: a vote or ballot in progress, a hand, a member arriving or a device coming and
 * going, which arrive by the hundred at once. Everything else, every decision among it
 * (CLOSE_VOTING, DECLARE_ELECTED, a motion, the adjournment), is written before it is
 * acknowledged, and that write carries every deferred change before it. A crash (not a
 * shutdown, which writes them) within that window loses those changes: a vote cast in it is gone
 * from the phone's screen when it rejoins, and is cast again; nothing decided is lost.
 */
export const DEFERRED_WRITES: ReadonlySet<MeetingAction['type']> = new Set<MeetingAction['type']>([
  'CAST_VOTE',
  'CAST_BALLOT',
  'RAISE_HAND',
  'LOWER_HAND',
  'ADD_MEMBER',
  'SET_MEMBER_PRESENCE',
  'REFRESH_MEMBERS',
]);

/** The tail of each meeting's queue of pending writes */
const meetingQueues = new Map<string, Promise<unknown>>();

/**
 * Run a task after every task already queued for the meeting has finished. The app runs as a
 * single server, so this serializes all writes to a meeting's state.
 */
function runExclusive<T>(meetingCode: string, task: () => Promise<T>): Promise<T> {
  const previous = meetingQueues.get(meetingCode) ?? Promise.resolve();
  const run = previous.then(task);
  const tail = run.catch(() => undefined);
  meetingQueues.set(meetingCode, tail);
  void tail.then(() => {
    if (meetingQueues.get(meetingCode) === tail) meetingQueues.delete(meetingCode);
  });
  return run;
}

/**
 * Apply an action to a meeting's state and persist it
 *
 * Actions on a meeting are applied one at a time, to the state in memory (meetingStorage), so
 * concurrent actions (such as many members voting at once) are never lost to a version
 * conflict. Optimistic locking remains as a safeguard: if the stored version changed anyway
 * (outside this process), the action is retried with the latest state (up to MAX_RETRIES
 * times).
 *
 * @param meetingCode - The meeting code
 * @param action - The action to apply
 * @param validator - Optional validation function to re-run on each retry attempt
 *                    This prevents race conditions where validation passes initially
 *                    but a concurrent action invalidates the conditions
 */
export function applyAction(
  meetingCode: string,
  action: MeetingAction,
  validator?: ActionValidator,
): Promise<ApplyActionResult> {
  return runExclusive(meetingCode, () => applyActionNow(meetingCode, action, validator));
}

async function applyActionNow(
  meetingCode: string,
  action: MeetingAction,
  validator?: ActionValidator,
): Promise<ApplyActionResult> {
  const storage = getStorage();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // The state in memory: every write to it comes through this queue
    const meeting = await storage.peekMeeting(meetingCode);
    if (!meeting) {
      return { success: false, error: 'Meeting not found', errorCode: 'MEETING_NOT_FOUND' };
    }

    // Re-validate on each attempt to catch race conditions
    // (e.g., the vote closed between validation and execution)
    if (validator) {
      const validation = validator(meeting.state, action);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error || 'Validation failed',
          errorCode: validation.errorCode,
        };
      }
    }

    try {
      // Apply the reducer
      const newState = meetingReducer(meeting.state, action);
      // Nothing changed: no new version, no write
      if (newState === meeting.state) {
        return {
          success: true,
          state: meeting.state,
          stateVersion: meeting.stateVersion,
          previousState: meeting.state,
          changed: false,
        };
      }
      const expectedVersion = meeting.stateVersion;
      const newVersion = expectedVersion + 1;

      // Persist with optimistic locking
      const updateResult = await storage.updateMeetingState(
        meetingCode,
        newState,
        expectedVersion,
        newVersion,
        { defer: DEFERRED_WRITES.has(action.type) },
      );

      if (updateResult.success) {
        return {
          success: true,
          state: newState,
          stateVersion: newVersion,
          previousState: meeting.state,
          changed: true,
        };
      }

      if (updateResult.error === 'NOT_FOUND') {
        return { success: false, error: 'Meeting not found', errorCode: 'MEETING_NOT_FOUND' };
      }

      // VERSION_CONFLICT - retry with fresh state
      if (attempt < MAX_RETRIES - 1) {
        logger.info(
          { meetingCode, attempt: attempt + 2, maxRetries: MAX_RETRIES },
          'Concurrency conflict, retrying',
        );
        continue;
      }
    } catch (error) {
      logger.error({ err: error }, 'Error applying action');
      return { success: false, error: 'Failed to apply action' };
    }
  }

  // All retries exhausted
  logger.warn(
    { meetingCode, maxRetries: MAX_RETRIES },
    'Concurrency conflict after all retry attempts',
  );
  return {
    success: false,
    error: 'State was modified by another user. Please try again.',
    errorCode: 'CONCURRENCY_CONFLICT',
  };
}

/**
 * A meeting's current state as this process has it (its actions all come through here), without
 * a trip to the database once it is in memory
 */
export async function getMeetingState(meetingCode: string): Promise<{
  state: MeetingState;
  stateVersion: number;
} | null> {
  const meeting = await getStorage().peekMeeting(meetingCode);
  if (!meeting) return null;
  return { state: meeting.state, stateVersion: meeting.stateVersion };
}
