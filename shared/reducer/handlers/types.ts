import type { MeetingState, MeetingAction, MeetingLogEntry } from '../../types/index.js';

export type { MeetingState, MeetingAction, MeetingLogEntry };

/**
 * A handler function that processes a specific subset of action types
 * Always returns a valid MeetingState. The main reducer routes actions
 * to the correct handler, so each handler only receives its own actions.
 */
export type ActionHandler = (
  state: MeetingState,
  action: MeetingAction,
  log: (timestamp: string, msg: string) => MeetingLogEntry[],
) => MeetingState;
