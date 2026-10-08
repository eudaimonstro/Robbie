import type {
  BallotTotals,
  ChairRulingRecord,
  CompletedMotion,
  ElectionSetAsideRecord,
  MeetingMinutes,
  MeetingState,
  MinutesApprovalRecord,
  MinutesContext,
  MinutesEntry,
  Officer,
  RecessRecord,
  UnfinishedBusinessRecord,
  Votes,
} from '../types/index.js';
import { PUT_BY_CHAIR } from '../constants/floor.js';
import { logElectionSetAside } from '../constants/logMessages.js';
import { MOTIONS } from '../constants/motions.js';
import { plainMotionName } from '../constants/motionWords.js';
import {
  NO_VOTES,
  addVotes,
  completedMotionVotes,
  motionThreshold,
  votesNeeded,
} from './voteCalculator.js';
import { joinNames } from './elections.js';
import { bylawChangeView } from './bylawAmendment.js';

/** An entry with where and when it happened, for grouping and ordering */
interface Placed {
  entry: MinutesEntry;
  agendaItemId?: number;
  decidedAt?: string;
  order: number;
}

const byName = (a: string, b: string) => a.localeCompare(b);

/** Motions on the agenda itself, made before it is adopted */
const AGENDA_MOTIONS = new Set(['adoptAgenda', 'amendAgenda']);

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
 * What the minutes of a meeting record, from its final state: who attended (anyone present
 * while it was in session, from the call to order to the adjournment), and each agenda item with what was decided under it, in the order it happened
 * by the server's clock. Votes and ballots are counts: who voted which way is never kept here.
 */
export function generateMeetingMinutes(state: MeetingState): MeetingMinutes {
  const attended = new Set(state.attendedIds ?? []);
  // Not who is present now: someone who arrived after the adjournment didn't attend
  const there = state.members.filter((m) => attended.has(m.id));
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
  // A ruling comes before what it decided at the same moment (a motion ruled out of order)
  for (const ruling of state.chairRulings ?? []) add({ kind: 'ruling', ruling }, ruling);
  // A motion on the agenda before any item was called opens the proceedings instead
  const onTheAgenda = (motion: CompletedMotion) =>
    AGENDA_MOTIONS.has(motion.type) && motion.agendaItemId === undefined;
  for (const motion of state.completedMotions) {
    if (!onTheAgenda(motion)) add({ kind: 'motion', motion }, motion);
  }
  // Officers one election chose together (several seats) are one entry, where the first was
  // declared
  const elections = new Map<number, Officer[]>();
  for (const officer of state.electedOfficers) {
    const together = officer.electionId !== undefined ? elections.get(officer.electionId) : null;
    if (together) {
      together.push(officer);
      continue;
    }
    const officers = [officer];
    if (officer.electionId !== undefined) elections.set(officer.electionId, officers);
    add({ kind: 'election', officer, officers }, officer);
  }
  for (const setAside of state.electionsSetAside ?? []) {
    add({ kind: 'setAside', setAside }, setAside);
  }
  if (state.minutesApproval) {
    add({ kind: 'minutes', approval: state.minutesApproval }, state.minutesApproval);
  }
  for (const recess of state.recesses ?? []) {
    add(
      { kind: 'recess', recess },
      { agendaItemId: recess.agendaItemId, decidedAt: recess.startedAt },
    );
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
    postponedToNextMeeting: state.completedMotions.filter(
      (m) => m.disposition === 'postponed' && m.postponedTo?.kind !== 'later',
    ),
    agenda: {
      adoption: state.agendaAdoption ?? null,
      motions: state.completedMotions.filter(onTheAgenda),
    },
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
 * ", two thirds required" when the motion needed more than a majority of the votes cast, or
 * ", two thirds of all 142 voting members required (95 votes)". An appeal's result says what
 * became of the chair's decision instead.
 */
function requiredText(motion: CompletedMotion): string {
  if (motion.type === 'appeal' || !MOTIONS[motion.type]) return '';
  const threshold = motionThreshold(motion);
  const needed = votesNeeded(threshold);
  if (needed !== null) {
    const fraction = threshold.fraction === '2/3' ? 'two thirds' : 'a majority';
    return `, ${fraction} of all ${threshold.members ?? 0} voting members required (${needed} ${needed === 1 ? 'vote' : 'votes'})`;
  }
  return threshold.fraction === '2/3' ? ', two thirds required' : '';
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
    // Declared by the chair ("the ayes have it"), or counted in the room
    const count = !motion.declared && counted(floor) ? `, ${floor.yea} to ${floor.nay}` : '';
    return `${result} by voice vote${required}${count}${abstaining}.`;
  }
  const how =
    motion.method === 'ballot'
      ? ' by ballot'
      : motion.method === 'rollcall'
        ? ' on a roll call'
        : motion.division
          ? ' on a division'
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
  // RONR 40:6: business done without a quorum is void unless a later meeting ratifies it
  if (motion.quorumPresent) return ' A quorum was present.';
  return motion.passed
    ? ' No quorum was present: the action has no effect unless a meeting with a quorum ratifies it.'
    : ' No quorum was present.';
}

/** ', with the amendment "..." pending' for a motion that left the floor with amendments on it */
function pendingText(motion: CompletedMotion): string {
  const pending = motion.pendingAmendments ?? [];
  if (pending.length === 0) return '';
  const listed = pending.map((text) => `"${md(text)}"`).join(' and ');
  return `, with the ${pending.length > 1 ? 'amendments' : 'amendment'} ${listed} pending`;
}

function outcomeText(motion: CompletedMotion): string {
  switch (motion.disposition) {
    case 'withdrawn':
      return motion.withPermission
        ? "Withdrawn by the mover, with the meeting's permission."
        : 'Withdrawn by the mover.';
    case 'no-second':
      return 'Died for lack of a second.';
    case 'unanimous':
      return `Adopted by unanimous consent.${quorumNote(motion)}`;
    case 'postponed': {
      const to = motion.postponedTo;
      const when = !to || to.kind === 'next-meeting' ? 'the next meeting' : md(to.when);
      return `Postponed to ${when}${pendingText(motion)}.`;
    }
    case 'postponed-indefinitely':
      return 'Postponed indefinitely.';
    case 'referred':
      return `Referred to ${md(motion.referredTo ?? 'a committee')}${pendingText(motion)}.`;
    case 'out-of-order':
      return 'Ruled out of order by the chair.';
    default:
      return `${voteText(motion)}${quorumNote(motion)}`;
  }
}

/** Text a member or the bylaws gave, as a Markdown quote: each paragraph escaped, one line each */
function quoted(lines: string[]): string {
  return lines
    .flatMap((line) => line.split(/\n\s*\n|\n/))
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n>\n> ')
    .replace(/^/, '> ');
}

/**
 * What a bylaw amendment changed (or would have): "As adopted, Section 4.2 "Quorum" reads:" and
 * the text, or a section struck out or renumbered. The text is the motion's own, as it was
 * decided, from the record.
 */
function bylawText(motion: CompletedMotion): string | null {
  const change = motion.bylawAmendment;
  if (!change) return null;
  const view = bylawChangeView(change);
  const heading = md(view.heading);
  const passed = motion.passed;
  const what =
    change.changeType === 'add'
      ? `a new section ${change.parentSectionLabel ? `under ${md(change.parentSectionLabel)}` : 'at the top level'}`
      : heading;
  switch (change.changeType) {
    case 'add':
    case 'modify': {
      // A new title or number alone
      if (change.changeType === 'modify' && change.newContent === undefined) {
        const retitle = change.newTitle !== undefined;
        const to = retitle ? `"${md(change.newTitle ?? '')}"` : md(change.newNumberLabel ?? '');
        if (passed) return `${heading} was ${retitle ? 'retitled' : 'renumbered as'} ${to}.`;
        return `The motion proposed ${retitle ? 'retitling' : 'renumbering'} ${heading} ${retitle ? '' : 'as '}${to}.`;
      }
      if (!view.proposed) return null;
      const intro = passed ? `As adopted, ${what} reads:` : `As proposed, ${what} would have read:`;
      const title = view.proposed.title ? [`**${md(view.proposed.title)}**`] : [];
      const body = (view.proposed.text ?? '').split(/\n/).map(md);
      return `${intro}\n\n${quoted([...title, ...body])}`;
    }
    case 'delete':
      return passed ? `${heading} was struck out.` : `The motion proposed striking out ${heading}.`;
    case 'renumber': {
      const number = md(change.newNumberLabel ?? '');
      return passed
        ? `${heading} was renumbered as ${number}.`
        : `The motion proposed renumbering ${heading} as ${number}.`;
    }
  }
}

function motionText(motion: CompletedMotion): string {
  // A motion amended was moved in its first words and decided in its last
  const text = `"${sentence(md(motion.originalText ?? motion.text))}"`;
  const moved =
    motion.mover === PUT_BY_CHAIR
      ? `The chair put the question: ${text}`
      : motion.mover
        ? `${md(motion.mover)} moved: ${text}`
        : `Moved: ${text}`;
  const seconded = motion.seconder ? ` Seconded by ${md(motion.seconder)}.` : '';
  const amended = motion.originalText ? ` As amended: "${sentence(md(motion.text))}"` : '';
  const decided = `**${md(plainMotionName(motion.name, motion.type))}.** ${moved}${seconded}${amended} ${outcomeText(motion)}`;
  const changed = bylawText(motion);
  return changed ? `${decided}\n\n${changed}` : decided;
}

/** "The meeting recessed at 8:02 PM and resumed at 8:15 PM." */
function recessText(recess: RecessRecord, zone: string): string {
  const began = recess.startedAt ? ` at ${clockTime(recess.startedAt, zone)}` : '';
  const ended = recess.endedAt ? ` and resumed at ${clockTime(recess.endedAt, zone)}` : '';
  return `The meeting recessed${began}${ended}.`;
}

function rulingText(ruling: ChairRulingRecord): string {
  const why = ruling.explanation ? ` ${sentence(md(ruling.explanation))}` : '';
  if (ruling.raisedBy) {
    return `**Point of order.** ${md(ruling.raisedBy)} raised a point of order: "${sentence(md(ruling.motionText))}" The chair ruled: ${md(ruling.ruling)}${why}`;
  }
  return `**Ruling of the chair.** On "${sentence(md(ruling.motionText))}" the chair ruled: ${md(ruling.ruling)}${why}`;
}

type Ballots = ReadonlyArray<Record<string, number>> | undefined;

/** "27 ballots cast (1 blank ballot not counted, 1 illegal ballot)" */
function castText(totals: BallotTotals): string {
  const count = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;
  const notes = [
    ...(totals.blank ? [`${count(totals.blank, 'blank ballot')} not counted`] : []),
    ...(totals.illegal ? [count(totals.illegal, 'illegal ballot')] : []),
  ];
  return `${count(totals.cast, 'ballot')} cast${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`;
}

/**
 * "Ballot 1, 27 ballots cast: Carmen Diaz 18, Ray Castillo 9" for each ballot: counts only, the
 * most first, a name written in marked so (records made before the totals were kept have none)
 */
function ballotTallies(ballots: Ballots, totals?: readonly BallotTotals[]): string[] {
  return (ballots ?? []).map((counts, index) => {
    const own = totals?.[index];
    const writeIns = new Set(own?.writeIns ?? []);
    const tally = Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => `${md(name)}${writeIns.has(name) ? ' (write-in)' : ''} ${count}`)
      .join(', ');
    return `Ballot ${index + 1}${own ? `, ${castText(own)}` : ''}: ${tally}`;
  });
}

/** "Carmen Diaz was elected.", "Alice and Ben were elected, two thirds required." */
function electedText(officers: Officer[]): string {
  const names = joinNames(
    officers.map((o) => `${md(o.name)}${o.writeIn ? ' (a write-in candidate)' : ''}`),
  );
  const verb = officers.length > 1 ? 'were elected' : 'was elected';
  if (officers.every((o) => o.acclamation)) return `${names} ${verb} by acclamation.`;
  switch (officers[0].requiredVotes) {
    case '2/3':
      return `${names} ${verb}, two thirds required.`;
    case 'plurality':
      return `${names} ${verb} by a plurality.`;
    default:
      return `${names} ${verb}.`;
  }
}

/**
 * One election: each ballot's count with who it elected, then anyone elected by acclamation
 * (fewer nominees than seats, or as many)
 */
function electionText(officers: Officer[]): string {
  const longest = officers.reduce((a, o) =>
    (o.ballots?.length ?? 0) > (a.ballots?.length ?? 0) ? o : a,
  );
  const lines = [`**Election for ${md(officers[0].position)}.**`];
  ballotTallies(longest.ballots, longest.ballotTotals).forEach((tally, index) => {
    lines.push(`${tally}.`);
    const chosen = officers.filter((o) => !o.acclamation && (o.ballots?.length ?? 0) === index + 1);
    if (chosen.length > 0) lines.push(electedText(chosen));
  });
  // Records made before ballots were kept, and acclamations
  const unballoted = officers.filter((o) => !o.acclamation && !o.ballots?.length);
  if (unballoted.length > 0) lines.push(electedText(unballoted));
  const acclaimed = officers.filter((o) => o.acclamation);
  if (acclaimed.length > 0) lines.push(electedText(acclaimed));
  return lines.join(' ');
}

function setAsideText(setAside: ElectionSetAsideRecord): string {
  const ballots = ballotTallies(setAside.ballots, setAside.ballotTotals).map(
    (tally) => `${tally}.`,
  );
  const position = setAside.position === null ? null : md(setAside.position);
  return [logElectionSetAside(position), ...ballots].join(' ');
}

/** 'the motion "Repave the lot" (Main motion, moved by Pat and seconded by Carmen)' and the like */
function unfinishedText(record: UnfinishedBusinessRecord): string {
  if (record.kind === 'election') {
    const ballots = ballotTallies(record.ballots, record.ballotTotals);
    return `the election for ${md(record.position)}${ballots.length > 0 ? ` (${ballots.join('; ')})` : ''}`;
  }
  const moved = record.mover === PUT_BY_CHAIR ? 'put by the chair' : `moved by ${md(record.mover)}`;
  const seconded = record.seconder
    ? ` and seconded by ${md(record.seconder)}`
    : record.awaitingSecond
      ? ' and awaiting a second'
      : '';
  const postponed = record.postponed ? ', postponed to later in the meeting' : '';
  return `the motion "${md(record.text)}" (${md(plainMotionName(record.name))}, ${moved}${seconded}${postponed})`;
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

function entryText(entry: MinutesEntry, zone: string): string {
  switch (entry.kind) {
    case 'recess':
      return recessText(entry.recess, zone);
    case 'motion':
      return motionText(entry.motion);
    case 'ruling':
      return rulingText(entry.ruling);
    case 'election':
      return electionText(entry.officers ?? [entry.officer]);
    case 'setAside':
      return setAsideText(entry.setAside);
    case 'minutes':
      return approvalText(entry.approval);
  }
}

/**
 * An agenda item that is the call to order and nothing else ("Call to order", "1. Call the
 * meeting to order", "Meeting called to order")
 */
const CALL_TO_ORDER = /^\W*(?:\d+\W*)?(?:(?:the\s+)?meeting\s+)?call(?:ed)?\b[^.]*\bto order\W*$/i;
/** An agenda item that is a report ("Treasurer's report", "Committee reports") */
const REPORT = /\breports?\b/i;
/** An agenda item that is the adjournment and nothing else ("Adjournment", "Adjourn the meeting") */
const ADJOURNMENT = /^\W*(?:\d+\W*)?adjourn(?:ment)?(?:\s+(?:of\s+)?the\s+meeting)?\W*$/i;

/**
 * The minutes as Markdown, the secretary's draft: a heading with the organization, the meeting,
 * its date and place and who presided; attendance; each agenda item with what was decided under
 * it (an item taken up with nothing recorded says so; the call to order and the adjournment are
 * said where the minutes open and close); and the adjournment, with any business left unfinished.
 * Dates and times are the organization's.
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

  // Business is only left unfinished by adjourning, so it says the meeting adjourned
  const adjourned = !!context.adjournedAt || minutes.unfinished.length > 0;
  const last = minutes.items.length - 1;
  paragraph('## Proceedings');
  // The agenda's adoption opens the proceedings: without objection, or on a motion
  for (const motion of minutes.agenda.motions) paragraph(motionText(motion));
  if (minutes.agenda.adoption?.how === 'consent') {
    paragraph('The agenda was adopted without objection.');
  }
  minutes.items.forEach((item, index) => {
    if (item.entries.length === 0) {
      // The call to order and the adjournment, with nothing under them: the opening paragraph
      // and the Adjournment section say they happened
      const opening = index === 0 && CALL_TO_ORDER.test(item.title) && !!context.calledToOrderAt;
      const closing = index === last && ADJOURNMENT.test(item.title) && adjourned;
      if (opening || closing) return;
    }
    // The agenda's own number, whichever items are left out
    paragraph(`### ${index + 1}. ${md(item.title)}`);
    if (item.entries.length === 0) {
      // A report taken up and heard, with no motion on it, was received (RONR 51:5)
      paragraph(
        item.status === 'pending'
          ? 'Not taken up.'
          : REPORT.test(item.title)
            ? 'Report received.'
            : 'No action was taken.',
      );
    }
    for (const entry of item.entries) paragraph(entryText(entry, zone));
  });
  if (minutes.otherEntries.length > 0) {
    if (minutes.items.length > 0) paragraph('### Other business');
    for (const entry of minutes.otherEntries) paragraph(entryText(entry, zone));
  }
  if (minutes.items.length === 0 && minutes.otherEntries.length === 0) {
    paragraph('No business was recorded.');
  }

  if (adjourned) {
    paragraph('## Adjournment');
    paragraph(adjournmentText(minutes, context.adjournedAt, zone));
  }
  // For the next meeting's agenda, as unfinished business
  if (minutes.postponedToNextMeeting.length > 0) {
    paragraph('## Postponed to the next meeting');
    for (const motion of minutes.postponedToNextMeeting) {
      const by =
        motion.mover && motion.mover !== PUT_BY_CHAIR ? `, moved by ${md(motion.mover)}` : '';
      lines.push(
        `- "${sentence(md(motion.text))}" (${md(plainMotionName(motion.name, motion.type))}${by})`,
      );
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Format meeting minutes as JSON (for export/API)
 */
export function formatMinutesAsJSON(minutes: MeetingMinutes): string {
  return JSON.stringify(minutes, null, 2);
}
