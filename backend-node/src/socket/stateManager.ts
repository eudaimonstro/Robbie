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
  | { success: true; state: MeetingState; stateVersion: number }
  | {
      success: false;
      error: string;
      errorCode?: 'CONCURRENCY_CONFLICT' | 'MEETING_NOT_FOUND' | ActionErrorCode;
    };

/** Maximum number of retry attempts for concurrent conflicts */
const MAX_RETRIES = 3;

/**
 * Apply an action to a meeting's state and persist it
 *
 * Uses optimistic locking to prevent race conditions when multiple users
 * submit actions concurrently. If a conflict is detected, the action is
 * retried with the latest state (up to MAX_RETRIES times).
 *
 * @param meetingCode - The meeting code
 * @param action - The action to apply
 * @param validator - Optional validation function to re-run on each retry attempt
 *                    This prevents race conditions where validation passes initially
 *                    but a concurrent action invalidates the conditions
 */
export async function applyAction(
  meetingCode: string,
  action: MeetingAction,
  validator?: ActionValidator,
): Promise<ApplyActionResult> {
  const storage = getStorage();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const meeting = await storage.getMeeting(meetingCode);
    if (!meeting) {
      return { success: false, error: 'Meeting not found', errorCode: 'MEETING_NOT_FOUND' };
    }

    // Re-validate on each attempt to catch race conditions
    // (e.g., proxy revoked between validation and execution)
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
      const expectedVersion = meeting.stateVersion;
      const newVersion = expectedVersion + 1;

      // Persist with optimistic locking
      const updateResult = await storage.updateMeetingState(
        meetingCode,
        newState,
        expectedVersion,
        newVersion,
      );

      if (updateResult.success) {
        return { success: true, state: newState, stateVersion: newVersion };
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
 * Get current meeting state
 */
export async function getMeetingState(meetingCode: string): Promise<{
  state: MeetingState;
  stateVersion: number;
} | null> {
  const storage = getStorage();
  const meeting = await storage.getMeeting(meetingCode);
  if (!meeting) return null;
  return { state: meeting.state, stateVersion: meeting.stateVersion };
}
