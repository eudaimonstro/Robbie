import type { Server } from 'socket.io';
import type { MeetingKind, MeetingRole, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import type { OrgRole } from '../generated/prisma/client.js';
import { getStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { atLeast } from '../orgs/roles.js';
import { getIoInstance } from './ioInstance.js';
import {
  findMeetingPacket,
  findOrgPeople,
  votersOf,
  type MeetingPacketInfo,
} from './meetingPacket.js';
import { roomManager } from './roomManager.js';
import { applyAction, getMeetingState } from './stateManager.js';
import { emitState, publicUpdate } from './statePublisher.js';

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** A member's name and meeting role as the organization has them now */
export interface RoleChange {
  id: number;
  name: string;
  role: MeetingRole;
  /** A presiding officer without a vote (in a board meeting, one who isn't a director) */
  nonVoting?: boolean;
}

/** A person's place in a live meeting: their role, and whether they preside without a vote */
export interface MeetingSeat {
  role: MeetingRole;
  nonVoting?: true;
}

/** What a person's seat depends on in the meeting: who presides, and who votes */
export interface SeatPacket {
  chairUserId: number | null;
  kind?: MeetingKind;
}

/**
 * A person's role in a live meeting, from the organization: the packet's presiding officer
 * chairs, secretaries and above are admins, members are members, and everyone else (viewers,
 * people outside the organization) is a guest. The presiding officer must still be a member.
 */
export function deriveMeetingRole(
  chairUserId: number | null,
  orgRole: OrgRole | null,
  userId: number,
): MeetingRole {
  if (!orgRole || !atLeast(orgRole, 'member')) return 'guest';
  if (chairUserId === userId) return 'chair';
  return atLeast(orgRole, 'secretary') ? 'admin' : 'member';
}

/**
 * A person's seat in a live meeting. In a meeting of the members, the role deriveMeetingRole
 * gives. In a board meeting the directors (members and above marked as on the board) are its
 * members, and admins when they are secretaries or above; the presiding officer chairs; a
 * secretary or above who isn't a director keeps the console (admin) without a vote, as does a
 * presiding officer who isn't one; everyone else in the organization (members, viewers)
 * observes; people outside it are guests.
 */
export function deriveMeetingSeat(
  packet: SeatPacket,
  person: { orgRole: OrgRole | null; isDirector: boolean },
  userId: number,
): MeetingSeat {
  const { orgRole } = person;
  if (packet.kind !== 'board')
    return { role: deriveMeetingRole(packet.chairUserId, orgRole, userId) };
  if (!orgRole) return { role: 'guest' };
  const director = person.isDirector && atLeast(orgRole, 'member');
  const presiding = atLeast(orgRole, 'member') && packet.chairUserId === userId;
  if (presiding) return director ? { role: 'chair' } : { role: 'chair', nonVoting: true };
  if (director) return { role: atLeast(orgRole, 'secretary') ? 'admin' : 'member' };
  if (atLeast(orgRole, 'secretary')) return { role: 'admin', nonVoting: true };
  return { role: 'observer' };
}

/**
 * The members whose role differs from what the organization gives them now, each with the
 * name the meeting has for them (a member's name is refreshed only when they join)
 */
export async function roleChanges(
  packet: { organizationId: string } & SeatPacket,
  members: readonly Member[],
): Promise<RoleChange[]> {
  if (members.length === 0) return [];
  const people = await findOrgPeople(
    packet.organizationId,
    members.map((m) => m.id),
  );
  return members.flatMap((m) => {
    const person = people.get(m.id);
    const seat = deriveMeetingSeat(
      packet,
      { orgRole: person?.role ?? null, isDirector: person?.isDirector ?? false },
      m.id,
    );
    return seat.role !== m.role || !!seat.nonVoting !== !!m.nonVoting
      ? [{ id: m.id, name: m.name, ...seat }]
      : [];
  });
}

/**
 * How long after a meeting's roles were all checked against the organization a join checks only
 * the joiner's own. Changes made in the app reach live meetings at once (syncLiveRoles,
 * syncOrganizationLiveRoles); this catches the rest (a script, a restart) without reading every
 * member's role on every one of 150 arrivals.
 */
export const ROLE_SWEEP_MS = 60_000;
/** When each meeting's roles were last all checked, in this process */
const sweptAt = new Map<string, number>();

/**
 * The other members' role changes a join brings in: all of them when the meeting's roles
 * haven't all been checked within ROLE_SWEEP_MS (as roleChanges), or `force` says they must be
 * (the joiner's own role changed, or the state's chair isn't the packet's); otherwise none
 */
export async function staleRoles(
  meetingCode: string,
  packet: { organizationId: string } & SeatPacket,
  members: readonly Member[],
  force = false,
): Promise<RoleChange[]> {
  const last = sweptAt.get(meetingCode);
  if (!force && last !== undefined && Date.now() - last < ROLE_SWEEP_MS) return [];
  const changes = await roleChanges(packet, members);
  sweptAt.set(meetingCode, Date.now());
  // Meetings not joined for an hour are forgotten (the next join checks every role)
  for (const [code, at] of sweptAt) {
    if (Date.now() - at > 60 * 60 * 1000) sweptAt.delete(code);
  }
  return changes;
}

/** Forget when a meeting's roles were checked (tests; a canceled meeting) */
export function forgetRoleSweeps(meetingCode?: string): void {
  if (meetingCode === undefined) sweptAt.clear();
  else sweptAt.delete(meetingCode);
}

/**
 * Give connected sockets their members' new roles, so permissions follow at once. A socket whose
 * role changes is sent the whole state as its new role sees it: the room's updates leave out
 * what hasn't changed (the previous minutes, say), which a guest made a member never had.
 */
export async function updateSocketRoles(
  io: TypedServer,
  meetingCode: string,
  changes: ReadonlyArray<{ id: number; role: MeetingRole }>,
): Promise<void> {
  if (changes.length === 0) return;
  const roles = new Map(changes.map((c) => [c.id, c.role]));
  for (const [id, role] of roles) roomManager.updateMemberRole(meetingCode, id, role);
  const moved = [];
  for (const socket of await io.in(`meeting:${meetingCode}`).fetchSockets()) {
    const role = roles.get(socket.data.userId);
    if (!role || socket.data.display || socket.data.role === role) continue;
    socket.data.role = role;
    moved.push(socket);
  }
  if (moved.length === 0) return;
  const latest = await getMeetingState(meetingCode);
  if (!latest) return;
  for (const socket of moved) {
    socket.emit('STATE_UPDATE', publicUpdate(latest, socket.data.role));
  }
}

/**
 * Until the call to order, who votes follows the packet and the organization: the kind of
 * meeting, and a board's directors with the quorum that follows from them. Applied only when the
 * kind or the number of directors changed, so a quorum the chair set stays otherwise. After the
 * call to order the state keeps the board it was called to order with, for the record.
 * @returns the result of the change, or null when nothing changed
 */
export async function syncVoters(
  packet: Pick<MeetingPacketInfo, 'robbieCode' | 'kind' | 'organizationId' | 'organization'>,
  state: MeetingState,
): Promise<{ state: MeetingState; stateVersion: number; kindChanged: boolean } | null> {
  if (state.meetingActive || state.meetingStage !== 'not-started') return null;
  const kind = state.kind ?? 'members';
  if (packet.kind === 'members' && kind === 'members') return null;
  const voters = await votersOf(packet);
  if (voters.kind === kind && voters.board?.directors === state.board?.directors) return null;
  const result = await applyAction(packet.robbieCode, {
    type: 'SET_BOARD',
    ...voters,
    timestamp: new Date().toISOString(),
  });
  if (!result.success || !result.changed) return null;
  return {
    state: result.state,
    stateVersion: result.stateVersion,
    kindChanged: voters.kind !== kind,
  };
}

/**
 * Bring every member's name and role in a live meeting into line with the organization and
 * the packet (after the presiding officer changes, say), and before the call to order who votes
 * (a director marked or a meeting's kind changed).
 * @returns the state after the change, or null if nothing changed
 */
export async function syncMeetingRoles(
  io: TypedServer,
  meetingCode: string,
): Promise<{ state: MeetingState; stateVersion: number } | null> {
  const packet = await findMeetingPacket(meetingCode);
  const meeting = packet ? await getStorage().getMeeting(meetingCode) : null;
  if (!packet || !meeting) return null;

  const voters = await syncVoters(packet, meeting.state);
  const changes = await roleChanges(packet, meeting.state.members);
  sweptAt.set(meetingCode, Date.now());
  if (changes.length === 0) {
    return voters && { state: voters.state, stateVersion: voters.stateVersion };
  }
  const result = await applyAction(meetingCode, {
    type: 'REFRESH_MEMBERS',
    members: changes,
    timestamp: new Date().toISOString(),
  });
  if (!result.success) return voters && { state: voters.state, stateVersion: voters.stateVersion };
  await updateSocketRoles(io, meetingCode, changes);
  return { state: result.state, stateVersion: result.stateVersion };
}

/**
 * After the schedule or the organization changes who is what: a live meeting's roles follow
 * at once, for the people in it and their sockets, and the room is sent the new state
 */
export async function syncLiveRoles(meetingCode: string): Promise<void> {
  const io = getIoInstance();
  if (!io) return;
  const synced = await syncMeetingRoles(io, meetingCode);
  if (synced) emitState(io, meetingCode, synced);
}

/** The same for every live meeting of an organization, after its members change */
export async function syncOrganizationLiveRoles(organizationId: string): Promise<void> {
  if (!getIoInstance()) return;
  // An adjourned meeting keeps the roles it ended with (a join brings them up to date if it
  // is called to order again)
  const packets = await prisma.meetingPacket.findMany({
    where: { organizationId, endedAt: null },
    select: { robbieCode: true },
  });
  // syncMeetingRoles finds nothing to do for a packet with no meeting stored yet
  for (const packet of packets) await syncLiveRoles(packet.robbieCode);
}
