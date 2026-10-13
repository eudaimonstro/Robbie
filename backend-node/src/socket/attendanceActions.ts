import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import type { ActionErrorCode } from '@robbie-bylawyer/shared/types/socket';
import { findMeetingPacket, findOrgPeople } from './meetingPacket.js';
import { deriveMeetingSeat } from './meetingRoles.js';
import { roomManager } from './roomManager.js';

type Prepared = { action: MeetingAction } | { error: string; errorCode: ActionErrorCode };

/**
 * What the server adds to the attendance actions before they are validated:
 * - MARK_PRESENT gets the person from the organization's roster, with the meeting role the
 *   organization gives them (the validator refuses it without one: not in the roster). A
 *   member present on a connected device is left to their device: it is already here, and
 *   leaves when it does.
 * - SET_HEADCOUNT is refused with more proxies held than the organization has voting members
 * - MARK_ABSENT is refused for a member whose device is still connected, however they were
 *   marked present: they are still in the room, and leave when their device does. Someone who
 *   hasn't joined gets the person from the roster, as MARK_PRESENT does.
 */
export async function prepareAttendanceAction(
  meetingCode: string,
  state: MeetingState,
  action: MeetingAction,
): Promise<Prepared> {
  if (action.type === 'MARK_PRESENT') {
    const existing = state.members.find((m) => m.id === action.userId);
    if (existing?.present && roomManager.isMemberConnected(meetingCode, existing.id)) {
      return {
        error: `${existing.name} is present on their device`,
        errorCode: 'INVALID_STATE',
      };
    }
    const member = await rosterMember(meetingCode, action.userId, true);
    return { action: member ? { ...action, member } : action };
  }

  // No more proxies and absentee ballots than the organization has voting members
  if (action.type === 'SET_HEADCOUNT' && action.proxiesHeld !== undefined) {
    const packet = await findMeetingPacket(meetingCode);
    const eligible = packet?.organization.eligibleVoters ?? null;
    if (eligible !== null && action.proxiesHeld > eligible) {
      return {
        error: `The proxies and absentee ballots held can't be more than the ${eligible} voting members`,
        errorCode: 'INVALID_ACTION',
      };
    }
  }

  if (action.type === 'MARK_ABSENT') {
    const member = state.members.find((m) => m.id === action.memberId);
    if (member?.present && roomManager.isMemberConnected(meetingCode, member.id)) {
      return {
        error: `${member.name} is still connected: they leave when their device does`,
        errorCode: 'MEMBER_CONNECTED',
      };
    }
    // Someone who hasn't joined is marked absent from the roster, without being marked present
    // first (which would put them among those who attended)
    if (!member) {
      const fromRoster = await rosterMember(meetingCode, action.memberId, false);
      return { action: fromRoster ? { ...action, member: fromRoster } : action };
    }
  }

  return { action };
}

/**
 * A person of the meeting's organization as a meeting member, with the seat the organization
 * gives them; null when they aren't in it
 */
async function rosterMember(
  meetingCode: string,
  userId: number,
  present: boolean,
): Promise<Member | null> {
  // Through the packet, which every live meeting has (older live states may not record
  // their organization)
  const packet = await findMeetingPacket(meetingCode);
  if (!packet) return null;
  const person = (await findOrgPeople(packet.organizationId, [userId])).get(userId);
  if (!person) return null;
  return {
    id: userId,
    // Someone marked present or absent may never have signed in to set a name
    name: person.name ?? person.email.split('@')[0],
    ...deriveMeetingSeat(packet, { orgRole: person.role, isDirector: person.isDirector }, userId),
    present,
  };
}

/**
 * After an attendance action is applied: a member marked absent is absent now, so the grace
 * period of a device that just left has nothing to do (an action that wasn't applied leaves
 * the grace period to end it)
 */
export function afterAttendanceAction(meetingCode: string, action: MeetingAction): void {
  if (action.type === 'MARK_ABSENT') {
    roomManager.cancelGrace(meetingCode, action.memberId);
  }
}
