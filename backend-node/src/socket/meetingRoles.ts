import type { Server } from 'socket.io';
import type { MeetingRole, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import type { OrgRole } from '../generated/prisma/client.js';
import { getStorage } from '../db/meetingStorage.js';
import { atLeast } from '../orgs/roles.js';
import { findMeetingPacket, findOrgPeople } from './meetingPacket.js';
import { roomManager } from './roomManager.js';
import { applyAction } from './stateManager.js';

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

/** The members whose name or role differs from what the organization has now */
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
    const person = people.get(m.id);
    const role = deriveMeetingRole(packet.chairUserId, person?.role ?? null, m.id);
    const name = person?.name ?? m.name;
    return role !== m.role || name !== m.name ? [{ id: m.id, name, role }] : [];
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
