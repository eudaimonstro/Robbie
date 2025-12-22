import type { MeetingState, MeetingAction } from '../../types/index.js';
import { logMemberJoined, logMemberPresenceChanged } from '../../constants/logMessages.js';
import type { ActionHandler } from './types.js';

export const memberHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'ADD_MEMBER': {
      const typedAction = action as Extract<MeetingAction, { type: 'ADD_MEMBER' }>;
      // Check if member already exists
      if (state.members.some(m => m.id === typedAction.member.id)) {
        return state;
      }
      return {
        ...state,
        members: [...state.members, typedAction.member],
        meetingLog: log(typedAction.timestamp, logMemberJoined(typedAction.member.name))
      };
    }

    case 'SET_MEMBER_ROLE': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_MEMBER_ROLE' }>;
      // If making someone chair, demote current chair first
      const updatedMembers = state.members.map(m => {
        if (m.id === typedAction.targetMemberId) {
          return { ...m, role: typedAction.newRole };
        }
        // If target is becoming chair, demote current chair
        if (typedAction.newRole === 'chair' && m.role === 'chair') {
          return { ...m, role: 'member' as const };
        }
        return m;
      });

      return {
        ...state,
        members: updatedMembers
      };
    }

    case 'SET_MEMBER_PRESENCE': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_MEMBER_PRESENCE' }>;
      const member = state.members.find(m => m.id === typedAction.memberId);
      if (!member) return state;

      return {
        ...state,
        members: state.members.map(m =>
          m.id === typedAction.memberId ? { ...m, present: typedAction.present } : m
        ),
        meetingLog: log(typedAction.timestamp, logMemberPresenceChanged(member.name, typedAction.present))
      };
    }

    default:
      return undefined;
  }
};
