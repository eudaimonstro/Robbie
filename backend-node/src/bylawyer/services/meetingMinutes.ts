/**
 * Minutes: written from a meeting's live record and what its packet and organization say
 */

import type { MeetingKind, MeetingState, MinutesContext } from '@robbie-bylawyer/shared/types';
import { formatMinutesAsMarkdown, generateMeetingMinutes } from '@robbie-bylawyer/shared/utils';
import { getStorage } from '../../db/meetingStorage.js';
import { prisma } from '../../db/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { logger } from '../../middleware/logger.js';
import { DIRECTORS } from '../../socket/meetingPacket.js';

/**
 * What the minutes need from outside the meeting state: the organization's name and time zone,
 * the meeting's title, place and times from its packet, and the organization's voting members
 * (member role and above; in a board meeting, its directors) for the absent list. Null when the
 * packet is gone.
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
      kind: true,
      organization: { select: { name: true, timeZone: true } },
    },
  });
  if (!packet) return null;
  // A board meeting's absent are its directors not present
  const voters = await prisma.organizationMember.findMany({
    where:
      packet.kind === 'board'
        ? { organizationId: packet.organizationId, ...DIRECTORS }
        : {
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

/**
 * The draft minutes of a meeting that has just adjourned, written from its final state, unless
 * the meeting has minutes already: a meeting adjourned again keeps the secretary's text (the
 * secretary can write the draft again). Best effort: the meeting has adjourned regardless.
 */
export async function draftMinutesOnAdjournment(
  meetingCode: string,
  state: MeetingState,
): Promise<void> {
  try {
    const packet = await prisma.meetingPacket.findUnique({
      where: { robbieCode: meetingCode },
      select: { id: true, organizationId: true, minutes: { select: { id: true } } },
    });
    if (!packet || packet.minutes) return;
    const context = await minutesContext(packet.id);
    if (!context) return;
    await prisma.minutes.create({
      data: {
        organizationId: packet.organizationId,
        packetId: packet.id,
        body: writeMinutes(state, context),
      },
    });
  } catch (error) {
    // Adjourned twice at once: the other adjournment wrote the draft
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
    logger.error({ err: error, meetingCode }, 'Failed to draft the minutes');
  }
}

/**
 * The minutes to put before a meeting: the organization's most recent published minutes of a
 * meeting of the same kind (the board approves the board's minutes, the members the members'),
 * not yet approved and not the meeting's own (the latest meeting first, then the latest
 * published)
 */
export function previousMinutesFor(
  organizationId: string,
  packetId: string,
  kind: MeetingKind = 'members',
): Promise<{ id: string; body: string } | null> {
  return prisma.minutes.findFirst({
    where: { organizationId, status: 'published', packetId: { not: packetId }, packet: { kind } },
    orderBy: [
      { packet: { scheduledFor: { sort: 'desc', nulls: 'last' } } },
      { publishedAt: 'desc' },
    ],
    select: { id: true, body: true },
  });
}

/**
 * Whether these minutes are before a live meeting of the organization: put before it to approve
 * (its previousMinutesId), and the meeting not adjourned (its packet not ended). Corrections
 * are made there, so the minutes the meeting holds stay the minutes it approves.
 */
export async function minutesBeforeLiveMeeting(
  organizationId: string,
  minutesId: string,
): Promise<boolean> {
  const packets = await prisma.meetingPacket.findMany({
    where: { organizationId, endedAt: null },
    select: { robbieCode: true },
  });
  const storage = getStorage();
  for (const { robbieCode } of packets) {
    const meeting = await storage.getMeeting(robbieCode);
    if (
      meeting?.state.previousMinutesId === minutesId &&
      meeting.state.meetingStage !== 'adjourned'
    ) {
      return true;
    }
  }
  return false;
}

/**
 * The previous minutes a meeting approved, marked approved with the meeting and its
 * corrections: only minutes of the meeting's organization that are still published. Best
 * effort, like the bylaw sync: the approval stands in the meeting regardless.
 */
export async function markPreviousMinutesApproved(
  meetingCode: string,
  state: MeetingState,
  now: Date = new Date(),
): Promise<void> {
  try {
    if (!state.previousMinutesId) return;
    const packet = await prisma.meetingPacket.findUnique({
      where: { robbieCode: meetingCode },
      select: { id: true, organizationId: true },
    });
    if (!packet) return;
    await prisma.minutes.updateMany({
      where: {
        id: state.previousMinutesId,
        organizationId: packet.organizationId,
        status: 'published',
      },
      data: {
        status: 'approved',
        approvedAt: now,
        approvedAtPacketId: packet.id,
        corrections: state.minutesApproval?.corrections ?? null,
      },
    });
  } catch (error) {
    logger.error({ err: error, meetingCode }, 'Failed to mark the previous minutes approved');
  }
}
