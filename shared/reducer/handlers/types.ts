import type { MeetingState, MeetingAction, MeetingLogEntry } from '../../types/index.js';

export type { MeetingState, MeetingAction, MeetingLogEntry };

/**
 * A handler function that processes a specific action type
 * Returns the new state, or undefined if it doesn't handle this action
 */
export type ActionHandler = (
  state: MeetingState,
  action: MeetingAction,
  log: (timestamp: string, msg: string) => MeetingLogEntry[]
) => MeetingState | undefined;
