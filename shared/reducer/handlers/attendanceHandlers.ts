import type { MeetingAction } from '../../types/index.js';
import { logHeadcountSet, logMemberMarkedPresent } from '../../constants/logMessages.js';
import { withPresence } from './memberHandlers.js';
import { withAttended } from './records.js';
import type { ActionHandler } from './types.js';

export const attendanceHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'MARK_PRESENT': {
      const typedAction = action as Extract<MeetingAction, { type: 'MARK_PRESENT' }>;
      // The server fills in the member from the organization's roster
      const fromRoster = typedAction.member;
      if (!fromRoster || fromRoster.id !== typedAction.userId) return state;

      const existing = state.members.find((m) => m.id === typedAction.userId);
      if (existing?.present && existing.presentBy === 'chair') return state;
      const marked = withPresence(existing ?? fromRoster, true, 'chair');

      return {
        ...state,
        members: existing
          ? state.members.map((m) => (m.id === marked.id ? marked : m))
          : [...state.members, marked],
        attendedIds: withAttended(state, marked.id),
        meetingLog: log(typedAction.timestamp, logMemberMarkedPresent(marked.name)),
      };
    }

    case 'SET_HEADCOUNT': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_HEADCOUNT' }>;
      const names = typedAction.names.map((n) => n.trim()).filter((n) => n.length > 0);
      if (
        typedAction.count === state.headcount &&
        names.length === state.headcountNames.length &&
        names.every((n, i) => n === state.headcountNames[i])
      ) {
        return state;
      }
      return {
        ...state,
        headcount: typedAction.count,
        headcountNames: names,
        meetingLog: log(typedAction.timestamp, logHeadcountSet(typedAction.count)),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
