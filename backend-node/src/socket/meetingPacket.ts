/**
 * A live meeting's packet: the scheduled meeting it is. The packet gives the live state its
 * organization, title, date, presiding officer, quorum and agenda.
 */

import type { AgendaItem, MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { quorumFromSettings } from '@robbie-bylawyer/shared/utils';
import type { OrgRole } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../middleware/logger.js';

/** What a live meeting needs from its packet and organization */
export interface MeetingPacketInfo {
  robbieCode: string;
  organizationId: string;
  title: string | null;
  scheduledFor: Date | null;
  chairUserId: number | null;
  organization: {
    name: string;
    eligibleVoters: number | null;
    quorumPercent: number | null;
    quorumCount: number | null;
  };
  /** In position order */
  agendaItems: Array<{ id: string; title: string }>;
}

/** A person as a meeting sees them: their name, and their role in the organization if any */
export interface MeetingPerson {
  name: string | null;
  email: string;
  orgRole: OrgRole | null;
}

/** The packet with this meeting code, or null: a code without a packet is no meeting */
export function findMeetingPacket(meetingCode: string): Promise<MeetingPacketInfo | null> {
  return prisma.meetingPacket.findUnique({
    where: { robbieCode: meetingCode },
    select: {
      robbieCode: true,
      organizationId: true,
      title: true,
      scheduledFor: true,
      chairUserId: true,
      organization: {
        select: { name: true, eligibleVoters: true, quorumPercent: true, quorumCount: true },
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
      memberships: { where: { organizationId }, select: { role: true } },
    },
  });
  if (!user) return null;
  return { name: user.name, email: user.email, orgRole: user.memberships[0]?.role ?? null };
}

/** The organization roles and names of these users; users who aren't members are left out */
export async function findOrgPeople(
  organizationId: string,
  userIds: number[],
): Promise<Map<number, { role: OrgRole; name: string | null; email: string }>> {
  const rows = await prisma.organizationMember.findMany({
    where: { organizationId, userId: { in: userIds } },
    select: { userId: true, role: true, user: { select: { name: true, email: true } } },
  });
  return new Map(rows.map((row) => [row.userId, { role: row.role, ...row.user }]));
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

/** A new live meeting's state, made from its packet */
export function stateFromPacket(packet: MeetingPacketInfo, rosterVoters: number): MeetingState {
  return {
    ...initialState,
    meetingCode: packet.robbieCode,
    organizationId: packet.organizationId,
    title: packet.title ?? '',
    scheduledFor: packet.scheduledFor?.toISOString() ?? null,
    quorum: quorumFromSettings(packet.organization, rosterVoters),
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
 * so the schedule shows which meetings happened. Best effort: the meeting goes on regardless.
 */
export async function recordMeetingTimes(
  meetingCode: string,
  action: MeetingAction,
  now: Date = new Date(),
): Promise<void> {
  try {
    if (action.type === 'START_MEETING') {
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
