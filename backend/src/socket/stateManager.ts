import type { MeetingState, MeetingAction } from '@robbie/shared/types';
import { meetingReducer } from '@robbie/shared/reducer';
import { getStorage } from '../db/meetingStorage.js';

/** Discriminated union for action result - ensures state/version exist when success is true */
export type ApplyActionResult =
  | { success: true; state: MeetingState; stateVersion: number }
  | { success: false; error: string };

/**
 * Apply an action to a meeting's state and persist it
 */
export async function applyAction(
  meetingCode: string,
  action: MeetingAction
): Promise<ApplyActionResult> {
  const storage = getStorage();
  const meeting = await storage.getMeeting(meetingCode);
  if (!meeting) {
    return { success: false, error: 'Meeting not found' };
  }

  try {
    // Apply the reducer
    const newState = meetingReducer(meeting.state, action);
    const newVersion = meeting.stateVersion + 1;

    // Persist the new state
    await storage.updateMeetingState(meetingCode, newState, newVersion);

    return { success: true, state: newState, stateVersion: newVersion };
  } catch (error) {
    console.error('Error applying action:', error);
    return { success: false, error: 'Failed to apply action' };
  }
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
