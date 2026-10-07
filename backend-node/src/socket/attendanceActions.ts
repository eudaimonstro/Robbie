import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import type { ActionErrorCode } from '@robbie-bylawyer/shared/types/socket';
import { findMeetingPacket, findOrgPeople } from './meetingPacket.js';
import { deriveMeetingRole } from './meetingRoles.js';
import { roomManager } from './roomManager.js';

type Prepared = { action: MeetingAction } | { error: string; errorCode: ActionErrorCode };

/**
 * What the server adds to the attendance actions before they are validated:
 * - MARK_PRESENT gets the person from the organization's roster, with the meeting role the
 *   organization gives them (the validator refuses it without one: not in the roster)
 * - MARK_ABSENT is refused for a member present on a device that is still connected: they are
 *   still in the room, and leave when their device does
 */
export async function prepareAttendanceAction(
  meetingCode: string,
  state: MeetingState,
  action: MeetingAction,
): Promise<Prepared> {
  if (action.type === 'MARK_PRESENT') {
    const packet = state.organizationId ? await findMeetingPacket(meetingCode) : null;
    if (!packet) return { action };
    const person = (await findOrgPeople(packet.organizationId, [action.userId])).get(action.userId);
    if (!person) return { action };
    return {
      action: {
        ...action,
        member: {
          id: action.userId,
          // Someone marked present may never have signed in to set a name
          name: person.name ?? person.email.split('@')[0],
          role: deriveMeetingRole(packet.chairUserId, person.role, action.userId),
          present: true,
        },
      },
    };
  }

  if (action.type === 'MARK_ABSENT') {
    const member = state.members.find((m) => m.id === action.memberId);
    if (
      member?.present &&
      member.presentBy !== 'chair' &&
      roomManager.isMemberConnected(meetingCode, member.id)
    ) {
      return {
        error: `${member.name} is still connected: they leave when their device does`,
        errorCode: 'MEMBER_CONNECTED',
      };
    }
    // Absent now, so the grace period of a device that just left has nothing to do
    roomManager.cancelGrace(meetingCode, action.memberId);
  }

  return { action };
}
