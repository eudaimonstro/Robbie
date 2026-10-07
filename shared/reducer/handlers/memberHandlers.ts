import type { MeetingAction, Member } from '../../types/index.js';
import {
  logMemberJoined,
  logMemberPresenceChanged,
  logMemberRenamed,
} from '../../constants/logMessages.js';
import type { ActionHandler } from './types.js';

/** A member with a new presence; presentBy only on a present member */
export function withPresence(
  member: Member,
  present: boolean,
  presentBy?: 'device' | 'chair',
): Member {
  const { presentBy: _previous, ...rest } = member;
  return present ? { ...rest, present, presentBy: presentBy ?? 'device' } : { ...rest, present };
}

export const memberHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'ADD_MEMBER': {
      const typedAction = action as Extract<MeetingAction, { type: 'ADD_MEMBER' }>;
      // Check if member already exists
      if (state.members.some((m) => m.id === typedAction.member.id)) {
        return state;
      }
      return {
        ...state,
        members: [...state.members, typedAction.member],
        meetingLog: log(typedAction.timestamp, logMemberJoined(typedAction.member.name)),
      };
    }

    case 'SET_MEMBER_ROLE': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_MEMBER_ROLE' }>;
      const targetMember = state.members.find((m) => m.id === typedAction.targetMemberId);
      if (!targetMember) return state;

      const oldRole = targetMember.role;

      // Update the target member's role and demote previous chair if needed
      const updatedMembers = state.members.map((member) => {
        if (member.id === typedAction.targetMemberId) {
          return { ...member, role: typedAction.newRole };
        }
        // There is one chair: appointing a new one demotes whoever holds the role now
        if (typedAction.newRole === 'chair' && member.role === 'chair') {
          return { ...member, role: 'member' as const };
        }
        return member;
      });

      // Build audit log message including who made the change
      const previousChair =
        typedAction.newRole === 'chair'
          ? state.members.find((m) => m.role === 'chair' && m.id !== typedAction.targetMemberId)
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
        meetingLog: log(typedAction.timestamp, logMessage),
      };
    }

    case 'SET_MEMBER_PRESENCE': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_MEMBER_PRESENCE' }>;
      const member = state.members.find((m) => m.id === typedAction.memberId);
      if (!member) return state;

      // A member the chair marked present stays marked when their device connects
      const current = member.present ? (member.presentBy ?? 'device') : undefined;
      const presentBy = typedAction.present
        ? current === 'chair'
          ? 'chair'
          : (typedAction.presentBy ?? 'device')
        : undefined;
      // Nothing changes (a device reconnecting, say): no state change and no log line
      if (member.present === typedAction.present && current === presentBy) return state;

      return {
        ...state,
        members: state.members.map((m) =>
          m.id === typedAction.memberId ? withPresence(m, typedAction.present, presentBy) : m,
        ),
        meetingLog: log(
          typedAction.timestamp,
          logMemberPresenceChanged(member.name, typedAction.present),
        ),
      };
    }

    case 'REFRESH_MEMBERS': {
      const typedAction = action as Extract<MeetingAction, { type: 'REFRESH_MEMBERS' }>;
      const updates = new Map(typedAction.members.map((m) => [m.id, m]));
      const newChair = typedAction.members.some((m) => m.role === 'chair');
      const members = state.members.map((m) => {
        const update = updates.get(m.id);
        if (update) return { ...m, name: update.name, role: update.role };
        // There is one chair
        return newChair && m.role === 'chair' ? { ...m, role: 'member' as const } : m;
      });
      // A guest can neither hold nor grant a proxy: a member who became one loses theirs
      const guests = new Set(members.filter((m) => m.role === 'guest').map((m) => m.id));
      const proxies = state.proxies.filter(
        (p) => !guests.has(p.grantedBy) && !guests.has(p.grantedTo),
      );
      return {
        ...state,
        members,
        proxies: proxies.length === state.proxies.length ? state.proxies : proxies,
      };
    }

    case 'RENAME_MEMBER': {
      const typedAction = action as Extract<MeetingAction, { type: 'RENAME_MEMBER' }>;
      const member = state.members.find((m) => m.id === typedAction.memberId);
      if (!member) return state;

      // Validate new name
      const trimmedName = typedAction.newName.trim();
      if (!trimmedName || trimmedName.length < 2) return state;

      const oldName = member.name;
      const renamedByMember = state.members.find((m) => m.id === typedAction.renamedBy);
      const renamedByName = renamedByMember?.name || 'System';

      // Check if this is a self-rename (member renaming themselves)
      const isSelfRename = typedAction.memberId === typedAction.renamedBy;

      return {
        ...state,
        members: state.members.map((m) =>
          m.id === typedAction.memberId
            ? { ...m, name: trimmedName, ...(isSelfRename && { selfRenameUsed: true }) }
            : m,
        ),
        meetingLog: log(
          typedAction.timestamp,
          logMemberRenamed(oldName, trimmedName, renamedByName),
        ),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
