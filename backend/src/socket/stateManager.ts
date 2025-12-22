import type { MeetingState, MeetingAction } from '@robbie/shared/types';
import { meetingReducer } from '@robbie/shared/reducer';
import { getStorage } from '../db/meetingStorage.js';

/** Discriminated union for action result - ensures state/version exist when success is true */
export type ApplyActionResult =
  | { success: true; state: MeetingState; stateVersion: number }
  | { success: false; error: string; errorCode?: 'CONCURRENCY_CONFLICT' | 'MEETING_NOT_FOUND' };

/** Maximum number of retry attempts for concurrent conflicts */
const MAX_RETRIES = 3;

/**
 * Apply an action to a meeting's state and persist it
 *
 * Uses optimistic locking to prevent race conditions when multiple users
 * submit actions concurrently. If a conflict is detected, the action is
 * retried with the latest state (up to MAX_RETRIES times).
 */
export async function applyAction(
  meetingCode: string,
  action: MeetingAction
): Promise<ApplyActionResult> {
  const storage = getStorage();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const meeting = await storage.getMeeting(meetingCode);
    if (!meeting) {
      return { success: false, error: 'Meeting not found', errorCode: 'MEETING_NOT_FOUND' };
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
        newVersion
      );

      if (updateResult.success) {
        return { success: true, state: newState, stateVersion: newVersion };
      }

      if (updateResult.error === 'NOT_FOUND') {
        return { success: false, error: 'Meeting not found', errorCode: 'MEETING_NOT_FOUND' };
      }

      // VERSION_CONFLICT - retry with fresh state
      if (attempt < MAX_RETRIES - 1) {
        console.log(`Concurrency conflict for ${meetingCode}, retrying (attempt ${attempt + 2}/${MAX_RETRIES})`);
        continue;
      }
    } catch (error) {
      console.error('Error applying action:', error);
      return { success: false, error: 'Failed to apply action' };
    }
  }

  // All retries exhausted
  console.warn(`Concurrency conflict for ${meetingCode} after ${MAX_RETRIES} attempts`);
  return {
    success: false,
    error: 'State was modified by another user. Please try again.',
    errorCode: 'CONCURRENCY_CONFLICT'
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
