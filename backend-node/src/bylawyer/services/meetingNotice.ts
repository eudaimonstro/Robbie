/**
 * The meeting notice: an email to every member of the organization with the meeting's date,
 * place, agenda and link, and the same content on a printable page for posting and mailing.
 * Robbie's notice is a courtesy: the bylaws and state law set the official requirements.
 */

import type { MeetingKind } from '@robbie-bylawyer/shared/types';
import { prisma } from '../../db/prisma.js';
import { ApiError } from '../../middleware/apiError.js';
import { emailForLog, logger } from '../../middleware/logger.js';
import { appUrl, quotedName, sendPlainEmails } from '../../auth/emailService.js';
import { pending } from '../../orgs/membershipService.js';

/** How many notices an organization may send in 24 hours, so it can't be used to spam */
export const NOTICES_PER_DAY = 3;
/**
 * Emails sent in one batch (one request to Resend), with a pause between batches, so the
 * provider's rate isn't exceeded
 */
export const NOTICE_BATCH = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

let batchPauseMs = 1000;
/** The pause between batches (tests set 0) */
export function setNoticeBatchPause(ms: number): void {
  batchPauseMs = ms;
}

/** The last words of every notice, the email and the printed one */
export const COURTESY_FOOTER =
  'This is a courtesy notice. Your bylaws and state law set the official notice requirements.';

/** The answers when a notice can't be sent */
export const NOTICE_AFTER_MEETING = 'This meeting has been called to order: its notice has gone by';
export const NOTICE_WITHOUT_DATE = 'Set the date of the meeting before sending its notice';
export const NOTICE_LIMIT = `An organization can send ${NOTICES_PER_DAY} notices a day. Try again tomorrow.`;
export const NOTICE_SENT_BEFORE = 'NOTICE_SENT_BEFORE';

/** Who sends the notice: named in it, with their email, so it reads as no phishing does */
export interface NoticeSender {
  id: number;
  name: string | null;
  email: string;
}

/** A meeting's notice, as the preview, the email and the printed page show it */
export interface NoticeContent {
  code: string;
  organization: string;
  title: string;
  kind: MeetingKind;
  /** When, in the organization's time zone ("Tuesday, November 10, 2026, at 7:00 PM CST") */
  when: string | null;
  /** The day alone ("Tuesday, November 10") */
  day: string | null;
  scheduledFor: string | null;
  location: string | null;
  agenda: Array<{ title: string; attachments: string[] }>;
  /** The names of the files and documents for the whole meeting */
  attachments: string[];
  /** The meeting's page: signing in there takes them into the meeting */
  link: string;
  footer: string;
}

/** The notice with what the secretary needs before sending it */
export interface NoticePreview extends NoticeContent {
  subject: string;
  text: string;
  /** How many people it goes to */
  recipients: number;
  /** When it was last sent, and by whom (null: never) */
  noticeSentAt: string | null;
  noticeSentBy: string | null;
  /** Notices the organization has sent in the last 24 hours, of NOTICES_PER_DAY */
  sentToday: number;
  limit: number;
  /** Whether it can be sent now: the meeting has a date and hasn't been called to order */
  sendable: boolean;
  /** Why not, when it can't */
  reason: string | null;
}

/** Text a user typed, on one line */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** A time zone Intl knows: the organization's, or Robbie's default */
function knownZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'America/Chicago';
  }
}

/** The date and time in a time zone, as the notice gives it */
export function noticeWhen(date: Date, timeZone: string): string {
  const zone = knownZone(timeZone);
  const day = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: zone,
  }).format(date);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: zone,
  }).format(date);
  return `${day}, at ${time}`;
}

/** The day alone, for the subject ("Tuesday, November 10") */
function noticeDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: knownZone(timeZone),
  }).format(date);
}

/** The packet as the notice reads it */
async function noticePacket(code: string) {
  return prisma.meetingPacket.findUnique({
    where: { robbieCode: code },
    select: {
      id: true,
      organizationId: true,
      robbieCode: true,
      title: true,
      kind: true,
      location: true,
      scheduledFor: true,
      startedAt: true,
      noticeSentAt: true,
      noticeSentBy: { select: { name: true, email: true } },
      organization: { select: { name: true, timeZone: true } },
      attachments: { select: { displayName: true }, orderBy: { position: 'asc' } },
      agendaItems: {
        select: {
          title: true,
          attachments: { select: { displayName: true }, orderBy: { position: 'asc' } },
        },
        orderBy: { position: 'asc' },
      },
    },
  });
}
type Packet = NonNullable<Awaited<ReturnType<typeof noticePacket>>>;

function contentOf(packet: Packet): NoticeContent {
  return {
    code: packet.robbieCode,
    organization: packet.organization.name,
    title: oneLine(packet.title ?? '') || (packet.kind === 'board' ? 'Board meeting' : 'Meeting'),
    kind: packet.kind,
    when: packet.scheduledFor
      ? noticeWhen(packet.scheduledFor, packet.organization.timeZone)
      : null,
    day: packet.scheduledFor ? noticeDay(packet.scheduledFor, packet.organization.timeZone) : null,
    scheduledFor: packet.scheduledFor?.toISOString() ?? null,
    location: packet.location ? oneLine(packet.location) : null,
    agenda: packet.agendaItems.map((item) => ({
      title: oneLine(item.title),
      attachments: item.attachments.map((a) => oneLine(a.displayName)),
    })),
    attachments: packet.attachments.map((a) => oneLine(a.displayName)),
    link: `${appUrl()}/meetings/${packet.robbieCode}`,
    footer: COURTESY_FOOTER,
  };
}

/**
 * The notice email, in plain text only. The organization's name, the meeting's title and the
 * sender's name come from users, so they are quoted (quotedName), and the sender is named by
 * their email address too. A board meeting's notice still goes to every member: they may attend
 * and observe.
 */
export function noticeEmail(
  content: NoticeContent,
  sender: NoticeSender,
): { subject: string; text: string } {
  const organization = quotedName(content.organization);
  const board = content.kind === 'board';
  const subject = `${board ? 'Board meeting notice' : 'Meeting notice'} from ${organization}${content.day ? `: ${content.day}` : ''}`;

  const lines: string[] = [];
  lines.push(
    `${organization} will hold a meeting of ${board ? 'its Board of Directors' : 'its members'}:`,
    '',
    `  "${content.title.replace(/"/g, "'")}"`,
    '',
    `When: ${content.when ?? 'to be announced'}`,
  );
  if (content.location) lines.push(`Where: ${content.location}`);
  lines.push('');
  if (content.agenda.length > 0) {
    lines.push('Agenda:');
    content.agenda.forEach((item, index) => {
      const attached =
        item.attachments.length > 0 ? ` (attached: ${item.attachments.join(', ')})` : '';
      lines.push(`${index + 1}. ${item.title}${attached}`);
    });
    lines.push('');
  }
  if (content.attachments.length > 0) {
    lines.push(`Documents: ${content.attachments.join(', ')}`, '');
  }
  if (board) {
    lines.push(
      'This is a meeting of the board: the directors vote. As a member you may attend and observe, in person or on your phone at:',
    );
  } else {
    lines.push('Take part on your phone: follow along and vote at the meeting at:');
  }
  lines.push(
    '',
    content.link,
    '',
    'Sign in before the meeting so your phone is ready. Robbie emails you a 6-digit code each time you sign in: there is no password.',
    '',
  );
  if (!board) lines.push('No phone? You still count: the chair will count you in the room.', '');
  const by = sender.name?.trim() ? `${quotedName(sender.name)} (${sender.email})` : sender.email;
  lines.push(`Sent by ${by} for ${organization}.`, '', COURTESY_FOOTER, '', 'Robbie', '');
  return { subject, text: lines.join('\n') };
}

/**
 * Everyone the notice goes to: the organization's members (every role) and its pending
 * additions, each email once, leaving out suspended accounts
 */
export async function noticeRecipients(
  organizationId: string,
  now: Date = new Date(),
): Promise<string[]> {
  const [members, invites] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId, user: { suspendedAt: null } },
      select: { user: { select: { email: true } } },
    }),
    prisma.organizationInvite.findMany({
      where: { organizationId, ...pending(now) },
      select: { email: true },
    }),
  ]);
  const emails = new Set(members.map((m) => m.user.email.toLowerCase()));
  const invited = invites.map((i) => i.email.toLowerCase()).filter((e) => !emails.has(e));
  // An addition whose email is a suspended account's gets nothing either
  const suspended = new Set(
    (
      await prisma.user.findMany({
        where: { email: { in: invited }, suspendedAt: { not: null } },
        select: { email: true },
      })
    ).map((u) => u.email.toLowerCase()),
  );
  for (const email of invited) if (!suspended.has(email)) emails.add(email);
  return [...emails].sort();
}

/** Notices the organization has sent in the last 24 hours */
function sentSince(organizationId: string, now: Date) {
  return prisma.meetingNotice.count({
    where: { organizationId, sentAt: { gt: new Date(now.getTime() - DAY_MS) } },
  });
}

/** Why the notice can't be sent now, or null */
function cannotSend(packet: Packet): string | null {
  if (packet.startedAt) return NOTICE_AFTER_MEETING;
  if (!packet.scheduledFor) return NOTICE_WITHOUT_DATE;
  return null;
}

/** The notice of the meeting with this code, as the sender would send it; null: no meeting */
export async function noticePreview(
  code: string,
  sender: NoticeSender,
  now: Date = new Date(),
): Promise<NoticePreview | null> {
  const packet = await noticePacket(code);
  if (!packet) return null;
  const content = contentOf(packet);
  const [recipients, sentToday] = await Promise.all([
    noticeRecipients(packet.organizationId, now),
    sentSince(packet.organizationId, now),
  ]);
  const reason = cannotSend(packet);
  return {
    ...content,
    ...noticeEmail(content, sender),
    recipients: recipients.length,
    noticeSentAt: packet.noticeSentAt?.toISOString() ?? null,
    noticeSentBy: packet.noticeSentBy
      ? (packet.noticeSentBy.name ?? packet.noticeSentBy.email.split('@')[0])
      : null,
    sentToday,
    limit: NOTICES_PER_DAY,
    sendable: reason === null,
    reason,
  };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send the meeting's notice to everyone (noticeRecipients), NOTICE_BATCH at a time with a pause
 * between batches. Refused after the call to order, without a date, past the organization's
 * daily limit, and when it was sent before unless `confirmResend` (the last two read under the
 * organization's row lock, so two sends at once can't both pass). Records the sending
 * (MeetingNotice, kept when the meeting is canceled, so the limit still counts it) and on the
 * packet when and by whom. A recipient whose email fails is logged (by domain) and counted; when
 * every email fails nothing was sent, and neither record stays.
 */
export async function sendNotice(
  code: string,
  sender: NoticeSender,
  options: { confirmResend?: boolean } = {},
  now: Date = new Date(),
): Promise<{ sent: number; failed: number; noticeSentAt: string | null }> {
  const packet = await noticePacket(code);
  if (!packet) throw ApiError.notFound();
  const reason = cannotSend(packet);
  if (reason) throw ApiError.conflict(reason);
  const sentBefore = (at: Date) =>
    ApiError.conflict(
      `The notice was sent on ${noticeWhen(at, packet.organization.timeZone)}. Send it again?`,
      NOTICE_SENT_BEFORE,
    );
  if (packet.noticeSentAt && !options.confirmResend) throw sentBefore(packet.noticeSentAt);
  const recipients = await noticeRecipients(packet.organizationId, now);
  const { record, previous } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${packet.organizationId} FOR UPDATE`;
    // Read again under the lock: a send that took it first is a send before this one
    const current = await tx.meetingPacket.findUnique({
      where: { id: packet.id },
      select: { noticeSentAt: true, noticeSentById: true, startedAt: true },
    });
    if (!current) throw ApiError.notFound();
    if (current.startedAt) throw ApiError.conflict(NOTICE_AFTER_MEETING);
    if (current.noticeSentAt && !options.confirmResend) throw sentBefore(current.noticeSentAt);
    const sent = await tx.meetingNotice.count({
      where: {
        organizationId: packet.organizationId,
        sentAt: { gt: new Date(now.getTime() - DAY_MS) },
      },
    });
    if (sent >= NOTICES_PER_DAY) throw ApiError.tooManyRequests(NOTICE_LIMIT);
    await tx.meetingPacket.update({
      where: { id: packet.id },
      data: { noticeSentAt: now, noticeSentById: sender.id },
    });
    const created = await tx.meetingNotice.create({
      data: {
        organizationId: packet.organizationId,
        packetId: packet.id,
        sentById: sender.id,
        sentAt: now,
        recipients: recipients.length,
      },
    });
    return { record: created, previous: current };
  });

  const email = noticeEmail(contentOf(packet), sender);
  let failed = 0;
  for (let start = 0; start < recipients.length; start += NOTICE_BATCH) {
    if (start > 0 && batchPauseMs > 0) await pause(batchPauseMs);
    const batch = recipients.slice(start, start + NOTICE_BATCH);
    let went: boolean[];
    try {
      went = await sendPlainEmails(
        batch.map((to) => ({ to, ...email })),
        'Meeting notice',
      );
    } catch (error) {
      logger.error(
        { err: error, meetingCode: code },
        "A batch of meeting notices couldn't be sent",
      );
      went = batch.map(() => false);
    }
    went.forEach((ok, index) => {
      if (ok) return;
      failed++;
      logger.warn(
        { to: emailForLog(batch[index]), meetingCode: code },
        "A meeting notice couldn't be delivered",
      );
    });
  }
  // Nobody got it: it wasn't sent, and doesn't count toward the day's notices
  if (recipients.length > 0 && failed === recipients.length) {
    await prisma.$transaction([
      prisma.meetingNotice.delete({ where: { id: record.id } }),
      prisma.meetingPacket.updateMany({
        where: { id: packet.id, noticeSentAt: now },
        data: { noticeSentAt: previous.noticeSentAt, noticeSentById: previous.noticeSentById },
      }),
    ]);
    logger.warn({ meetingCode: code, recipients: recipients.length }, 'No meeting notice went');
    return { sent: 0, failed, noticeSentAt: null };
  }
  if (failed > 0) {
    await prisma.meetingNotice.update({ where: { id: record.id }, data: { failed } });
  }
  logger.info({ meetingCode: code, recipients: recipients.length, failed }, 'Meeting notice sent');
  return { sent: recipients.length - failed, failed, noticeSentAt: now.toISOString() };
}
