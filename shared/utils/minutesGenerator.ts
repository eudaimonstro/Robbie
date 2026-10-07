import type {
  ChairRulingRecord,
  CompletedMotion,
  ElectionSetAsideRecord,
  MeetingMinutes,
  MeetingState,
  MinutesApprovalRecord,
  MinutesContext,
  MinutesEntry,
  Officer,
  UnfinishedBusinessRecord,
  Votes,
} from '../types/index.js';
import { PUT_BY_CHAIR } from '../constants/floor.js';
import { logElectionSetAside } from '../constants/logMessages.js';
import { MOTIONS } from '../constants/motions.js';
import { plainMotionName } from '../constants/motionWords.js';
import { NO_VOTES, addVotes, completedMotionVotes } from './voteCalculator.js';

/** An entry with where and when it happened, for grouping and ordering */
interface Placed {
  entry: MinutesEntry;
  agendaItemId?: number;
  decidedAt?: string;
  order: number;
}

const byName = (a: string, b: string) => a.localeCompare(b);

/**
 * What a member typed, as literal text in the minutes' Markdown: on one line (newlines and runs
 * of spaces made one space), with every character Markdown reads as markup escaped, and a start
 * that would make a list item, a quote or a heading escaped too. The formatter's own Markdown
 * is never put through this.
 */
export function md(text: string): string {
  return String(text)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\*_[\]()!#<>|`~]/g, '\\$&')
    .replace(/^([-+])/, '\\$1')
    .replace(/^(\d+)\./, '$1\\.');
}

/**
 * What the minutes of a meeting record, from its final state: who attended (anyone present at
 * any point), and each agenda item with what was decided under it, in the order it happened
 * by the server's clock. Votes and ballots are counts: who voted which way is never kept here.
 */
export function generateMeetingMinutes(state: MeetingState): MeetingMinutes {
  const attended = new Set(state.attendedIds ?? []);
  const there = state.members.filter((m) => m.present || attended.has(m.id));
  const present = there
    .filter((m) => m.role !== 'guest')
    .map((m) => ({ id: m.id, name: m.name, marked: m.presentBy === 'chair' }))
    .sort((a, b) => byName(a.name, b.name));
  const guests = there
    .filter((m) => m.role === 'guest')
    .map((m) => m.name)
    .sort(byName);

  const placed: Placed[] = [];
  const add = (entry: MinutesEntry, where: { agendaItemId?: number; decidedAt?: string }) => {
    placed.push({
      entry,
      agendaItemId: where.agendaItemId,
      decidedAt: where.decidedAt,
      order: placed.length,
    });
  };
  for (const motion of state.completedMotions) add({ kind: 'motion', motion }, motion);
  for (const ruling of state.chairRulings ?? []) add({ kind: 'ruling', ruling }, ruling);
  for (const officer of state.electedOfficers) add({ kind: 'election', officer }, officer);
  for (const setAside of state.electionsSetAside ?? []) {
    add({ kind: 'setAside', setAside }, setAside);
  }
  if (state.minutesApproval) {
    add({ kind: 'minutes', approval: state.minutesApproval }, state.minutesApproval);
  }
  // By the server's clock; anything recorded without it comes first, in the order it was kept
  placed.sort((a, b) => (a.decidedAt ?? '').localeCompare(b.decidedAt ?? '') || a.order - b.order);

  const agendaIds = new Set(state.agenda.map((item) => item.id));
  return {
    meetingCode: state.meetingCode,
    title: state.title,
    chairName: state.members.find((m) => m.role === 'chair')?.name ?? null,
    present,
    guests,
    headcount: state.headcount ?? 0,
    headcountNames: state.headcountNames ?? [],
    quorum: state.quorum,
    quorumAtCallToOrder: state.quorumAtCallToOrder ?? null,
    items: state.agenda.map((item) => ({
      title: item.title,
      status: item.status,
      entries: placed.filter((p) => p.agendaItemId === item.id).map((p) => p.entry),
    })),
    otherEntries: placed
      .filter((p) => p.agendaItemId === undefined || !agendaIds.has(p.agendaItemId))
      .map((p) => p.entry),
    unfinished: state.unfinishedAtAdjournment ?? [],
  };
}

/** A time zone this runtime knows, or UTC */
function knownZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

// ICU puts a narrow no-break space before AM and PM; the minutes are plain text
const plainSpaces = (text: string) => text.replace(/[\u202f\u00a0]/g, ' ');

/** "7:02 PM" in the organization's time zone */
function clockTime(iso: string, timeZone: string): string {
  return plainSpaces(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
      new Date(iso),
    ),
  );
}

/** "Tuesday, October 20, 2026" in the organization's time zone */
function longDate(iso: string, timeZone: string): string {
  return plainSpaces(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(iso)),
  );
}

/** Text as a sentence: with a closing period unless it has one (or a question or exclamation mark) */
function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

const counted = (votes: Votes) => votes.yea + votes.nay + votes.abstain > 0;

/**
 * ", two thirds required" when the motion needed more than a majority. An appeal's result says
 * what became of the chair's decision instead.
 */
function requiredText(motion: CompletedMotion): string {
  if (motion.type === 'appeal') return '';
  return MOTIONS[motion.type]?.vote === '2/3' ? ', two thirds required' : '';
}

/**
 * "Carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5." and the like, with the vote
 * required when it is more than a majority
 */
function voteText(motion: CompletedMotion): string {
  const result =
    motion.type === 'appeal'
      ? motion.passed
        ? "The chair's decision was sustained"
        : "The chair's decision was overturned"
      : motion.passed
        ? 'Carried'
        : 'Failed';
  // A record made before the parts were kept is counted from its device votes
  const device = motion.deviceVotes ?? completedMotionVotes(motion);
  const floor = motion.floorVotes ?? NO_VOTES;
  const total = addVotes(device, floor);
  const abstaining = total.abstain > 0 ? `, ${total.abstain} abstaining` : '';
  const required = requiredText(motion);
  if (motion.method === 'voice') {
    const count = counted(floor) ? `, ${floor.yea} to ${floor.nay}` : '';
    return `${result} on a voice vote${required}${count}${abstaining}.`;
  }
  const how =
    motion.method === 'ballot'
      ? ' by ballot'
      : motion.method === 'rollcall'
        ? ' on a roll call'
        : '';
  if (counted(device) && counted(floor)) {
    return `${result}${how}${required}, on devices ${device.yea} to ${device.nay} and in the room ${floor.yea} to ${floor.nay}: ${total.yea} to ${total.nay}${abstaining}.`;
  }
  if (counted(total)) {
    return `${result}${how}${required}, ${total.yea} to ${total.nay}${abstaining}.`;
  }
  return `${result}${how}${required}.`;
}

function quorumNote(motion: CompletedMotion): string {
  if (motion.quorumPresent === undefined) return '';
  return motion.quorumPresent ? ' A quorum was present.' : ' No quorum was present.';
}

function outcomeText(motion: CompletedMotion): string {
  switch (motion.disposition) {
    case 'withdrawn':
      return 'Withdrawn by the mover.';
    case 'no-second':
      return 'Died for lack of a second.';
    case 'unanimous':
      return `Adopted by unanimous consent.${quorumNote(motion)}`;
    default:
      return `${voteText(motion)}${quorumNote(motion)}`;
  }
}

function motionText(motion: CompletedMotion): string {
  const text = `"${sentence(md(motion.text))}"`;
  const moved =
    motion.mover === PUT_BY_CHAIR
      ? `The chair put the question: ${text}`
      : motion.mover
        ? `${md(motion.mover)} moved: ${text}`
        : `Moved: ${text}`;
  const seconded = motion.seconder ? ` Seconded by ${md(motion.seconder)}.` : '';
  return `**${md(plainMotionName(motion.name, motion.type))}.** ${moved}${seconded} ${outcomeText(motion)}`;
}

function rulingText(ruling: ChairRulingRecord): string {
  const why = ruling.explanation ? ` ${sentence(md(ruling.explanation))}` : '';
  return `**Ruling of the chair.** On "${sentence(md(ruling.motionText))}" the chair ruled: ${md(ruling.ruling)}${why}`;
}

type Ballots = ReadonlyArray<Record<string, number>> | undefined;

/** "Ballot 1: Carmen Diaz 18, Ray Castillo 9" for each ballot: counts only, the most first */
function ballotTallies(ballots: Ballots): string[] {
  return (ballots ?? []).map((counts, index) => {
    const tally = Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => `${md(name)} ${count}`)
      .join(', ');
    return `Ballot ${index + 1}: ${tally}`;
  });
}

/** "Carmen Diaz was elected.", with the vote required when it was not a majority */
function electedText(officer: Officer): string {
  switch (officer.requiredVotes) {
    case '2/3':
      return `${md(officer.name)} was elected, two thirds required.`;
    case 'plurality':
      return `${md(officer.name)} was elected by a plurality.`;
    default:
      return `${md(officer.name)} was elected.`;
  }
}

function electionText(officer: Officer): string {
  const ballots = ballotTallies(officer.ballots).map((tally) => `${tally}.`);
  return [`**Election for ${md(officer.position)}.**`, ...ballots, electedText(officer)].join(' ');
}

function setAsideText(setAside: ElectionSetAsideRecord): string {
  const ballots = ballotTallies(setAside.ballots).map((tally) => `${tally}.`);
  const position = setAside.position === null ? null : md(setAside.position);
  return [logElectionSetAside(position), ...ballots].join(' ');
}

/** 'the motion "Repave the lot" (Main motion, moved by Pat and seconded by Carmen)' and the like */
function unfinishedText(record: UnfinishedBusinessRecord): string {
  if (record.kind === 'election') {
    const ballots = ballotTallies(record.ballots);
    return `the election for ${md(record.position)}${ballots.length > 0 ? ` (${ballots.join('; ')})` : ''}`;
  }
  const moved = record.mover === PUT_BY_CHAIR ? 'put by the chair' : `moved by ${md(record.mover)}`;
  const seconded = record.seconder
    ? ` and seconded by ${md(record.seconder)}`
    : record.awaitingSecond
      ? ' and awaiting a second'
      : '';
  return `the motion "${md(record.text)}" (${md(plainMotionName(record.name))}, ${moved}${seconded})`;
}

/** "The meeting adjourned at 8:42 PM with the following unfinished: ..." */
function adjournmentText(
  minutes: MeetingMinutes,
  adjournedAt: string | null,
  zone: string,
): string {
  const when = adjournedAt ? ` at ${clockTime(adjournedAt, zone)}` : '';
  const items = minutes.unfinished.map(unfinishedText);
  if (items.length === 0) return `The meeting adjourned${when}.`;
  const listed =
    items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0];
  return `The meeting adjourned${when} with the following unfinished: ${listed}.`;
}

function approvalText(approval: MinutesApprovalRecord): string {
  return approval.corrections
    ? `The minutes of the previous meeting were approved with corrections: ${sentence(md(approval.corrections))}`
    : 'The minutes of the previous meeting were approved as read.';
}

function entryText(entry: MinutesEntry): string {
  switch (entry.kind) {
    case 'motion':
      return motionText(entry.motion);
    case 'ruling':
      return rulingText(entry.ruling);
    case 'election':
      return electionText(entry.officer);
    case 'setAside':
      return setAsideText(entry.setAside);
    case 'minutes':
      return approvalText(entry.approval);
  }
}

/**
 * The minutes as Markdown, the secretary's draft: a heading with the organization, the meeting,
 * its date and place and who presided; attendance; each agenda item with what was decided under
 * it; and the adjournment, with any business left unfinished. Dates and times are the organization's.
 */
export function formatMinutesAsMarkdown(minutes: MeetingMinutes, context: MinutesContext): string {
  const zone = knownZone(context.timeZone);
  const lines: string[] = [];
  const paragraph = (text: string) => lines.push(text, '');

  paragraph(`# ${md(context.organizationName)}`);
  paragraph(`## Minutes of the ${md(context.title || minutes.title || 'Meeting')}`);
  const day = context.scheduledFor ?? context.calledToOrderAt;
  if (day) {
    paragraph(`${longDate(day, zone)}${context.location ? `, at ${md(context.location)}` : ''}.`);
  } else if (context.location) {
    paragraph(`At ${md(context.location)}.`);
  }
  const opening = [
    ...(minutes.chairName ? [`${md(minutes.chairName)} presided.`] : []),
    ...(context.calledToOrderAt
      ? [`The meeting was called to order at ${clockTime(context.calledToOrderAt, zone)}.`]
      : []),
  ];
  if (opening.length > 0) paragraph(opening.join(' '));

  paragraph('## Attendance');
  const members = minutes.present.map((p) =>
    p.marked ? `${md(p.name)} (marked present)` : md(p.name),
  );
  paragraph(
    members.length > 0
      ? `**Members present (${members.length}):** ${members.join(', ')}.`
      : '**Members present:** none.',
  );
  if (minutes.headcount > 0) {
    const named = minutes.headcountNames.map(md);
    const others = minutes.headcount - named.length;
    if (named.length === 0) {
      paragraph(`**Also present without an account:** ${minutes.headcount}.`);
    } else {
      const rest = others > 0 ? ` and ${others} ${others === 1 ? 'other' : 'others'}` : '';
      paragraph(
        `**Also present without an account (${minutes.headcount}):** ${named.join(', ')}${rest}.`,
      );
    }
  }
  if (minutes.guests.length > 0) paragraph(`**Guests:** ${minutes.guests.map(md).join(', ')}.`);
  const presentIds = new Set(minutes.present.map((p) => p.id));
  const absent = context.voters
    .filter((v) => !presentIds.has(v.id))
    .map((v) => v.name)
    .sort(byName)
    .map(md);
  if (absent.length > 0) paragraph(`**Absent (${absent.length}):** ${absent.join(', ')}.`);
  if (minutes.quorumAtCallToOrder !== null) {
    paragraph(
      `A quorum of ${minutes.quorum} was ${minutes.quorumAtCallToOrder ? '' : 'not '}present at the call to order.`,
    );
  }

  paragraph('## Proceedings');
  minutes.items.forEach((item, index) => {
    paragraph(`### ${index + 1}. ${md(item.title)}`);
    if (item.status === 'pending' && item.entries.length === 0) paragraph('Not taken up.');
    for (const entry of item.entries) paragraph(entryText(entry));
  });
  if (minutes.otherEntries.length > 0) {
    if (minutes.items.length > 0) paragraph('### Other business');
    for (const entry of minutes.otherEntries) paragraph(entryText(entry));
  }
  if (minutes.items.length === 0 && minutes.otherEntries.length === 0) {
    paragraph('No business was recorded.');
  }

  // Business is only left unfinished by adjourning, so it says the meeting adjourned
  if (context.adjournedAt || minutes.unfinished.length > 0) {
    paragraph('## Adjournment');
    paragraph(adjournmentText(minutes, context.adjournedAt, zone));
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Format meeting minutes as JSON (for export/API)
 */
export function formatMinutesAsJSON(minutes: MeetingMinutes): string {
  return JSON.stringify(minutes, null, 2);
}
