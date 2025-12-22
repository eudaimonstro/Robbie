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
      const targetMember = state.members.find(m => m.id === typedAction.targetMemberId);
      if (!targetMember) return state;

      const oldRole = targetMember.role;

      // Update the target member's role and demote previous chair if needed
      const updatedMembers = state.members.map(member => {
        if (member.id === typedAction.targetMemberId) {
          return { ...member, role: typedAction.newRole };
        }
        // If assigning a new chair, demote the previous chair to member
        if (typedAction.newRole === 'chair' && typedAction.previousChairId && member.id === typedAction.previousChairId) {
          return { ...member, role: 'member' as const };
        }
        return member;
      });

      // Build audit log message including who made the change
      const previousChair = typedAction.previousChairId
        ? state.members.find(m => m.id === typedAction.previousChairId)
        : null;

      // changedBy is optional (added by server enrichment), fallback to 'System' if not present
      const changedBy = typedAction.changedBy || 'System';

      let logMessage: string;
      if (typedAction.newRole === 'chair' && previousChair) {
        logMessage = `[ROLE CHANGE] ${changedBy} transferred chair to ${targetMember.name}. ${previousChair.name} is now a member.`;
      } else {
        logMessage = `[ROLE CHANGE] ${changedBy} changed ${targetMember.name}'s role from ${oldRole} to ${typedAction.newRole}.`;
      }

      return {
        ...state,
        members: updatedMembers,
        meetingLog: log(typedAction.timestamp, logMessage)
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
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
