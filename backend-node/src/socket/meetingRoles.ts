import type { Server } from 'socket.io';
import type { MeetingRole, MeetingState, Member } from '@robbie-bylawyer/shared/types';
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
import { findMeetingPacket, findOrgPeople } from './meetingPacket.js';
import { roomManager } from './roomManager.js';
import { applyAction } from './stateManager.js';
import { emitState } from './statePublisher.js';

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
 * The members whose role differs from what the organization gives them now, each with the
 * name the meeting has for them: a member's name is refreshed only when they join, so a name
 * taken in the meeting (RENAME_MEMBER) stays
 */
export async function roleChanges(
  packet: { organizationId: string; chairUserId: number | null },
  members: readonly Member[],
): Promise<RoleChange[]> {
  if (members.length === 0) return [];
  const people = await findOrgPeople(
    packet.organizationId,
    members.map((m) => m.id),
  );
  return members.flatMap((m) => {
    const role = deriveMeetingRole(packet.chairUserId, people.get(m.id)?.role ?? null, m.id);
    return role !== m.role ? [{ id: m.id, name: m.name, role }] : [];
  });
}

/** Give connected sockets their members' new roles, so permissions follow at once */
export async function updateSocketRoles(
  io: TypedServer,
  meetingCode: string,
  changes: ReadonlyArray<{ id: number; role: MeetingRole }>,
): Promise<void> {
  if (changes.length === 0) return;
  const roles = new Map(changes.map((c) => [c.id, c.role]));
  for (const [id, role] of roles) roomManager.updateMemberRole(meetingCode, id, role);
  for (const socket of await io.in(`meeting:${meetingCode}`).fetchSockets()) {
    const role = roles.get(socket.data.userId);
    if (role && !socket.data.display) socket.data.role = role;
  }
}

/**
 * Bring every member's name and role in a live meeting into line with the organization and
 * the packet (after the presiding officer changes, say).
 * @returns the state after the change, or null if nothing changed
 */
export async function syncMeetingRoles(
  io: TypedServer,
  meetingCode: string,
): Promise<{ state: MeetingState; stateVersion: number } | null> {
  const packet = await findMeetingPacket(meetingCode);
  const meeting = packet ? await getStorage().getMeeting(meetingCode) : null;
  if (!packet || !meeting) return null;

  const changes = await roleChanges(packet, meeting.state.members);
  if (changes.length === 0) return null;
  const result = await applyAction(meetingCode, {
    type: 'REFRESH_MEMBERS',
    members: changes,
    timestamp: new Date().toISOString(),
  });
  if (!result.success) return null;
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
  const packets = await prisma.meetingPacket.findMany({
    where: { organizationId },
    select: { robbieCode: true },
  });
  // syncMeetingRoles finds nothing to do for a packet whose meeting isn't live
  for (const packet of packets) await syncLiveRoles(packet.robbieCode);
}
