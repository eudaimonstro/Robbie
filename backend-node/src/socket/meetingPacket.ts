/**
 * A live meeting's packet: the scheduled meeting it is. The packet gives the live state its
 * organization, title, date, presiding officer, quorum and agenda.
 */

import type {
  AgendaItem,
  BoardInfo,
  MeetingAction,
  MeetingKind,
  MeetingState,
} from '@robbie-bylawyer/shared/types';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { boardQuorum, quorumFromSettings } from '@robbie-bylawyer/shared/utils';
import type { OrgRole, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../middleware/logger.js';

/** What a live meeting needs from its packet and organization */
export interface MeetingPacketInfo {
  id: string;
  robbieCode: string;
  organizationId: string;
  title: string | null;
  scheduledFor: Date | null;
  chairUserId: number | null;
  /** Who votes: the members, or the board's directors */
  kind: MeetingKind;
  /** When the meeting adjourned (null until it does, and again if called to order again) */
  endedAt: Date | null;
  organization: {
    name: string;
    eligibleVoters: number | null;
    quorumPercent: number | null;
    quorumCount: number | null;
    /** The board's quorum when the bylaws set one; null is a majority of the directors */
    boardQuorum: number | null;
  };
  /** In position order */
  agendaItems: Array<{ id: string; title: string }>;
}

/**
 * A person as a meeting sees them: their name, their role in the organization if any, and
 * whether they are on its board
 */
export interface MeetingPerson {
  name: string | null;
  email: string;
  orgRole: OrgRole | null;
  isDirector: boolean;
}

/** The packet with this meeting code, or null: a code without a packet is no meeting */
export function findMeetingPacket(meetingCode: string): Promise<MeetingPacketInfo | null> {
  return prisma.meetingPacket.findUnique({
    where: { robbieCode: meetingCode },
    select: {
      id: true,
      robbieCode: true,
      organizationId: true,
      title: true,
      scheduledFor: true,
      chairUserId: true,
      kind: true,
      endedAt: true,
      organization: {
        select: {
          name: true,
          eligibleVoters: true,
          quorumPercent: true,
          quorumCount: true,
          boardQuorum: true,
        },
      },
      agendaItems: { select: { id: true, title: true }, orderBy: { position: 'asc' } },
    },
  });
}

/** A signed-in user, with their role in the organization (null when not a member) */
export async function findPerson(
  organizationId: string,
  userId: number,
): Promise<MeetingPerson | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      memberships: { where: { organizationId }, select: { role: true, isDirector: true } },
    },
  });
  if (!user) return null;
  const membership = user.memberships[0];
  return {
    name: user.name,
    email: user.email,
    orgRole: membership?.role ?? null,
    isDirector: membership?.isDirector ?? false,
  };
}

/** The organization roles and names of these users; users who aren't members are left out */
export async function findOrgPeople(
  organizationId: string,
  userIds: number[],
): Promise<
  Map<number, { role: OrgRole; name: string | null; email: string; isDirector: boolean }>
> {
  const rows = await prisma.organizationMember.findMany({
    where: { organizationId, userId: { in: userIds } },
    select: {
      userId: true,
      role: true,
      isDirector: true,
      user: { select: { name: true, email: true } },
    },
  });
  return new Map(
    rows.map((row) => [row.userId, { role: row.role, isDirector: row.isDirector, ...row.user }]),
  );
}

/**
 * The organization's directors: members marked as on the board, with the member role or above
 * (a viewer can't be one; the flag of someone made a viewer since is ignored)
 */
export const DIRECTORS: Prisma.OrganizationMemberWhereInput = {
  isDirector: true,
  role: { in: ['member', 'secretary', 'admin', 'owner'] },
};

/** How many directors the organization has */
export function countDirectors(organizationId: string): Promise<number> {
  return prisma.organizationMember.count({ where: { organizationId, ...DIRECTORS } });
}

/**
 * Who votes in the meeting, as the packet and the organization say now: the kind, the board (for
 * a board meeting: its directors) and the quorum. A meeting of the members has the quorum its
 * settings give; a board's is the organization's board quorum, or a majority of the directors.
 */
export async function votersOf(
  packet: Pick<MeetingPacketInfo, 'kind' | 'organizationId' | 'organization'>,
): Promise<{ kind: MeetingKind; board: BoardInfo | null; quorum: number }> {
  if (packet.kind === 'board') {
    const directors = await countDirectors(packet.organizationId);
    return {
      kind: 'board',
      board: { directors },
      quorum: boardQuorum(directors, packet.organization.boardQuorum),
    };
  }
  const rosterVoters = await countRosterVoters(packet.organizationId);
  return {
    kind: 'members',
    board: null,
    quorum: quorumFromSettings(packet.organization, rosterVoters),
  };
}

/** The organization's members with the member role or above: the default quorum base */
export function countRosterVoters(organizationId: string): Promise<number> {
  return prisma.organizationMember.count({
    where: { organizationId, role: { in: ['member', 'secretary', 'admin', 'owner'] } },
  });
}

/** The live agenda from the packet's agenda items, in order, each linked to its item */
export function agendaFromPacket(items: MeetingPacketInfo['agendaItems']): AgendaItem[] {
  return items.map((item, index) => ({
    id: index + 1,
    title: item.title,
    status: 'pending' as const,
    packetItemId: item.id,
  }));
}

/** A new live meeting's state, made from its packet and who votes in it (votersOf) */
export function stateFromPacket(
  packet: MeetingPacketInfo,
  voters: { kind: MeetingKind; board: BoardInfo | null; quorum: number },
): MeetingState {
  return {
    ...initialState,
    meetingCode: packet.robbieCode,
    organizationId: packet.organizationId,
    title: packet.title ?? '',
    scheduledFor: packet.scheduledFor?.toISOString() ?? null,
    kind: voters.kind,
    board: voters.board,
    quorum: voters.quorum,
    agenda: agendaFromPacket(packet.agendaItems),
  };
}

/** Record on the packet the presiding officer named in the meeting, so it outlasts a restart */
export async function savePresidingOfficer(meetingCode: string, userId: number): Promise<void> {
  await prisma.meetingPacket.update({
    where: { robbieCode: meetingCode },
    data: { chairUserId: userId },
  });
}

/**
 * Record on the packet when the meeting was called to order (the first time) and adjourned,
 * so the schedule shows which meetings happened. A meeting called to order again after
 * adjourning is no longer over. Best effort: the meeting goes on regardless.
 */
export async function recordMeetingTimes(
  meetingCode: string,
  action: MeetingAction,
  now: Date = new Date(),
): Promise<void> {
  try {
    if (action.type === 'START_MEETING') {
      await prisma.meetingPacket.updateMany({
        where: { robbieCode: meetingCode },
        data: { endedAt: null },
      });
      await prisma.meetingPacket.updateMany({
        where: { robbieCode: meetingCode, startedAt: null },
        data: { startedAt: now },
      });
    } else if (action.type === 'END_MEETING') {
      await prisma.meetingPacket.updateMany({
        where: { robbieCode: meetingCode },
        data: { endedAt: now },
      });
    }
  } catch (error) {
    logger.error({ err: error, meetingCode }, 'Failed to record meeting times');
  }
}
