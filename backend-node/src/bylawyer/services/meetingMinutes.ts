/**
 * Minutes: written from a meeting's live record and what its packet and organization say
 */

import type { MeetingState, MinutesContext } from '@robbie-bylawyer/shared/types';
import { formatMinutesAsMarkdown, generateMeetingMinutes } from '@robbie-bylawyer/shared/utils';
import { prisma } from '../../db/prisma.js';

/**
 * What the minutes need from outside the meeting state: the organization's name and time zone,
 * the meeting's title, place and times from its packet, and the organization's voting members
 * (member role and above) for the absent list. Null when the packet is gone.
 */
export async function minutesContext(packetId: string): Promise<MinutesContext | null> {
  const packet = await prisma.meetingPacket.findUnique({
    where: { id: packetId },
    select: {
      organizationId: true,
      title: true,
      location: true,
      scheduledFor: true,
      startedAt: true,
      endedAt: true,
      organization: { select: { name: true, timeZone: true } },
    },
  });
  if (!packet) return null;
  const voters = await prisma.organizationMember.findMany({
    where: {
      organizationId: packet.organizationId,
      role: { in: ['member', 'secretary', 'admin', 'owner'] },
    },
    select: { userId: true, user: { select: { name: true, email: true } } },
  });
  return {
    organizationName: packet.organization.name,
    timeZone: packet.organization.timeZone,
    title: packet.title ?? '',
    location: packet.location,
    scheduledFor: packet.scheduledFor?.toISOString() ?? null,
    calledToOrderAt: packet.startedAt?.toISOString() ?? null,
    adjournedAt: packet.endedAt?.toISOString() ?? null,
    // Someone who never set a name is listed by the first part of their email, as in a meeting
    voters: voters.map((v) => ({ id: v.userId, name: v.user.name ?? v.user.email.split('@')[0] })),
  };
}

/** A meeting's minutes as Markdown, from its live state */
export function writeMinutes(state: MeetingState, context: MinutesContext): string {
  return formatMinutesAsMarkdown(generateMeetingMinutes(state), context);
}
