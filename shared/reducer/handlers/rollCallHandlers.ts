import type { MeetingAction, RollCallRecord } from '../../types/index.js';
import {
  LOG_ROLL_CALL_STARTED,
  logRollCallResponse,
  logRollCallComplete,
  logMemberMarkedAbsent,
} from '../../constants/logMessages.js';
import { withPresence } from './memberHandlers.js';
import type { ActionHandler } from './types.js';

export const rollCallHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'START_ROLL_CALL': {
      const typedAction = action as Extract<MeetingAction, { type: 'START_ROLL_CALL' }>;
      // Guests don't answer the roll
      const responses: RollCallRecord[] = state.members
        .filter((member) => member.role !== 'guest')
        .map((member) => ({
          memberId: member.id,
          memberName: member.name,
          status: 'not-responded' as const,
        }));
      return {
        ...state,
        rollCall: {
          inProgress: true,
          startedAt: typedAction.timestamp,
          responses,
        },
        meetingLog: log(typedAction.timestamp, LOG_ROLL_CALL_STARTED),
      };
    }

    case 'RESPOND_ROLL_CALL': {
      const typedAction = action as Extract<MeetingAction, { type: 'RESPOND_ROLL_CALL' }>;
      if (!state.rollCall) return state;

      const member = state.members.find((m) => m.id === typedAction.memberId);
      if (!member) return state;

      // Update the response
      const updatedResponses = state.rollCall.responses.map((r) =>
        r.memberId === typedAction.memberId
          ? { ...r, status: typedAction.status, respondedAt: typedAction.timestamp }
          : r,
      );

      // Also update member presence based on roll call response
      const isPresent = typedAction.status === 'present';
      const updatedMembers = state.members.map((m) =>
        m.id === typedAction.memberId ? withPresence(m, isPresent, m.presentBy) : m,
      );

      return {
        ...state,
        rollCall: { ...state.rollCall, responses: updatedResponses },
        members: updatedMembers,
        meetingLog: log(
          typedAction.timestamp,
          logRollCallResponse(member.name, typedAction.status),
        ),
      };
    }

    case 'COMPLETE_ROLL_CALL': {
      const typedAction = action as Extract<MeetingAction, { type: 'COMPLETE_ROLL_CALL' }>;
      if (!state.rollCall) return state;

      // Count attendance
      const present = state.rollCall.responses.filter((r) => r.status === 'present').length;
      const absent = state.rollCall.responses.filter((r) => r.status === 'absent').length;
      const excused = state.rollCall.responses.filter((r) => r.status === 'excused').length;

      return {
        ...state,
        rollCall: {
          ...state.rollCall,
          inProgress: false,
          completedAt: typedAction.timestamp,
        },
        meetingLog: log(typedAction.timestamp, logRollCallComplete(present, absent, excused)),
      };
    }

    case 'MARK_ABSENT': {
      const typedAction = action as Extract<MeetingAction, { type: 'MARK_ABSENT' }>;
      const member = state.members.find((m) => m.id === typedAction.memberId);
      if (!member) return state;

      // Update member presence
      const updatedMembers = state.members.map((m) =>
        m.id === typedAction.memberId ? withPresence(m, false) : m,
      );

      // If roll call is in progress, also update the roll call response
      let updatedRollCall = state.rollCall;
      if (state.rollCall) {
        const newStatus = typedAction.excused ? 'excused' : 'absent';
        updatedRollCall = {
          ...state.rollCall,
          responses: state.rollCall.responses.map((r) =>
            r.memberId === typedAction.memberId
              ? {
                  ...r,
                  status: newStatus as 'absent' | 'excused',
                  respondedAt: typedAction.timestamp,
                }
              : r,
          ),
        };
      }

      return {
        ...state,
        members: updatedMembers,
        rollCall: updatedRollCall,
        meetingLog: log(
          typedAction.timestamp,
          logMemberMarkedAbsent(member.name, typedAction.excused),
        ),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
