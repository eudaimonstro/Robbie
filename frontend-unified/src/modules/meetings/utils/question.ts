import {
  LOG_MEETING_ADJOURNED,
  PUT_BY_CHAIR,
  plainMotionName,
} from '@robbie-bylawyer/shared/constants';
import type { Election, MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import {
  amendInsertedWords,
  applyTextAmendment,
  attendanceSummary,
  votesNeeded,
  bylawChangeView,
  describeTextAmendment,
  joinNames,
  motionThreshold,
  remainingNominees,
  thresholdText,
  winnersOf,
  type BylawChangeView,
} from '@robbie-bylawyer/shared/utils';
import type { VoteResult } from '../hooks/useVoteResults';
import { formatClockTime } from '../../../utils/dates';
import { latestDecision } from './decisions';

/** Whatever is before the assembly, in the one shape the question card draws */
export interface QuestionView {
  /** What kind of question it is, shown as a label: "Main Motion", "Election for Director" */
  kind: string;
  /** The question itself */
  text: string;
  /** "Moved by Alice Brennan, seconded by Ben Whitaker" */
  byline: string | null;
  /** The vote it needs: "Majority", "Two thirds", "Plurality"; null when the chair rules */
  requirement: string | null;
  /** The vote needed is out of reach of those present: "Only 29 present: this can't pass" */
  outOfReach?: string;
  /** Moved and waiting for a second */
  awaitingSecond: boolean;
  /** Questions pending beneath it, the nearest first */
  beneath: string[];
  /** For a bylaw amendment, the section and its text as it reads now and as it would read */
  bylawText?: BylawChangeView;
  /** For an amendment, the words beneath it as they would read if it is adopted */
  reads?: { label: string; text: string };
  /** Changes when the question does, so the card crossfades */
  key: string;
}

const REQUIREMENTS = { majority: 'Majority', '2/3': 'Two thirds', plurality: 'Plurality' } as const;

function requirementOf(vote: Motion['vote'] | Election['requiredVotes']): string | null {
  return Object.hasOwn(REQUIREMENTS, vote) ? REQUIREMENTS[vote as keyof typeof REQUIREMENTS] : null;
}

/**
 * The vote a motion needs, plainly: "Majority", "Two thirds", or for a bylaw amendment under
 * its organization's rule "Two thirds of all 142 voting members: 95 votes needed"; null when the
 * chair rules on it
 */
export function motionRequirement(motion: Motion): string | null {
  if (motion.vote === 'none') return null;
  return thresholdText(motionThreshold(motion));
}

/**
 * When a share of all the voting members needs more yes votes than there are people present:
 * "Only 29 present: this can't pass"
 */
function outOfReach(state: MeetingState, motion: Motion): Pick<QuestionView, 'outOfReach'> {
  if (motion.vote === 'none') return {};
  const needed = votesNeeded(motionThreshold(motion));
  const { present } = attendanceSummary(state);
  return needed !== null && needed > present
    ? { outOfReach: `Only ${present} present: this can't pass` }
    : {};
}

/** "Election for Director", or with several seats to fill "Election for Director, 2 seats" */
function electionKind(position: string, seats: number): string {
  return seats > 1 ? `Election for ${position}, ${seats} seats` : `Election for ${position}`;
}

/**
 * Who brought the motion: "Moved by Alice Brennan", "Moved from the floor by Carmen Diaz", or
 * "Put by the chair" for a question the chair puts from the agenda (it has no mover)
 */
export function moverLine(
  motion: Pick<Motion, 'mover' | 'fromFloor' | 'putByChair'> & { type?: string },
): string {
  if (motion.putByChair) return PUT_BY_CHAIR;
  // A point of order is raised, not moved
  if (motion.type === 'pointOrder') {
    return motion.fromFloor
      ? `Raised from the floor by ${motion.mover}`
      : `Raised by ${motion.mover}`;
  }
  return motion.fromFloor ? `Moved from the floor by ${motion.mover}` : `Moved by ${motion.mover}`;
}

/**
 * What an amendment would make of the words beneath it: the motion as it would read, or for an
 * amendment of an amendment, the amendment as it would read
 */
function readsOf(motion: Motion, beneath: Motion | undefined): Pick<QuestionView, 'reads'> {
  if (!beneath || !motion.textAmendment) return {};
  if (motion.type === 'amend') {
    const text = applyTextAmendment(beneath.text, motion.textAmendment);
    return text ? { reads: { label: 'If adopted, the motion reads', text } } : {};
  }
  if (motion.type === 'amendAmendment' && beneath.textAmendment) {
    const change = amendInsertedWords(beneath.textAmendment, motion.textAmendment);
    return change
      ? { reads: { label: 'If adopted, the amendment reads', text: describeTextAmendment(change) } }
      : {};
  }
  return {};
}

/** The text a bylaw amendment puts before the meeting, for the question card */
function bylawTextOf(motion: Motion): Pick<QuestionView, 'bylawText'> {
  return motion.type === 'bylawAmendment' && motion.bylawAmendment
    ? { bylawText: bylawChangeView(motion.bylawAmendment) }
    : {};
}

function beneathLine(motion: Motion): string {
  return `${plainMotionName(motion.name, motion.type)}: ${motion.text}`;
}

/**
 * Who stands for the position nominations are (or were) open for: declined nominees, and anyone
 * already elected to it in this meeting, left out
 */
export function nomineesFor(state: MeetingState, position: string): string[] {
  return remainingNominees(state, position);
}

/**
 * The question before the assembly, or null when nothing is pending (or the meeting adjourned). A
 * motion made during an election (only a privileged or incidental one is in order then) comes
 * before the election it interrupts.
 */
export function describeQuestion(state: MeetingState): QuestionView | null {
  if (state.meetingStage === 'adjourned') return null;

  // A point of order raised while a motion awaits a second comes first: the chair rules on it
  if (state.pendingSecond && state.currentMotion?.vote !== 'none') {
    const motion = state.pendingSecond;
    return {
      kind: motion.name,
      text: motion.text,
      byline: `${moverLine(motion)}, awaiting a second`,
      requirement: motionRequirement(motion),
      ...outOfReach(state, motion),
      awaitingSecond: true,
      beneath: [...state.motionStack].reverse().map(beneathLine),
      ...bylawTextOf(motion),
      ...readsOf(motion, state.motionStack.at(-1)),
      key: `second-${motion.id}`,
    };
  }

  if (state.currentMotion) {
    const motion = state.currentMotion;
    return {
      kind: motion.name,
      text: motion.text,
      byline: motion.secondedBy
        ? `${moverLine(motion)}, seconded by ${motion.secondedBy}`
        : moverLine(motion),
      // An appeal's vote needs no majority for the chair: a tie sustains the ruling
      requirement:
        motion.type === 'appeal' ? 'A tie sustains the chair' : motionRequirement(motion),
      ...outOfReach(state, motion),
      awaitingSecond: false,
      beneath: state.motionStack
        .filter((m) => m.id !== motion.id)
        .reverse()
        .map(beneathLine),
      ...bylawTextOf(motion),
      ...readsOf(motion, state.motionStack.at(-2)),
      key: `motion-${motion.id}`,
    };
  }

  const election = state.currentElection;
  if (election?.votingInProgress) {
    const seats = election.seats ?? 1;
    return {
      kind: electionKind(election.position, seats),
      text: election.candidates.map((c) => c.name).join(', ') || 'No candidates',
      byline: seats > 1 ? `Ballot in progress: vote for up to ${seats}` : 'Ballot in progress',
      requirement: requirementOf(election.requiredVotes),
      awaitingSecond: false,
      beneath: [],
      key: `election-${election.id}-${(election.ballots ?? []).length}`,
    };
  }

  // The ballot closed: its count, and who has the vote required, until the chair declares them
  // elected (the stamp says ELECTED only then); once they are, the seats still open
  if (election) {
    const winners = winnersOf(election);
    const seats = election.seats ?? 1;
    const declaredHere = state.electedOfficers.filter((o) => o.electionId === election.id).length;
    return {
      kind: electionKind(election.position, seats),
      text:
        winners.length > 0
          ? `${joinNames(winners)} ${winners.length > 1 ? 'have' : 'has'} the vote required`
          : declaredHere > 0
            ? seats === 1
              ? 'One seat is still open'
              : `${seats} seats are still open`
            : 'Nobody has the vote required',
      byline:
        winners.length === 0 && declaredHere > 0
          ? `Candidates: ${election.candidates.map((c) => c.name).join(', ')}`
          : `Ballot: ${electionTally(election) || 'no ballots'}`,
      requirement: requirementOf(election.requiredVotes),
      awaitingSecond: false,
      beneath: [],
      key: `election-closed-${election.id}-${(election.ballots ?? []).length}-${winners.length}`,
    };
  }

  // Nominations open, or closed with the ballot still to open
  if (state.currentNominationPosition && !election) {
    const position = state.currentNominationPosition;
    const nominees = nomineesFor(state, position);
    const open = state.nominationsOpen;
    return {
      kind: electionKind(position, state.openSeats ?? 1),
      text: open ? 'Nominations are open' : 'Nominations are closed',
      byline:
        nominees.length > 0
          ? `Nominated: ${nominees.join(', ')}`
          : open
            ? 'No nominations yet'
            : 'Nobody has been nominated',
      requirement: null,
      awaitingSecond: false,
      beneath: [],
      key: `nominations-${open ? 'open' : 'closed'}-${position}`,
    };
  }

  return null;
}

/**
 * Where the meeting is, as a label for the top bar: before it, the agenda item before it, in
 * session between items, or adjourned (the agenda, not the order-of-business stages, is what
 * the chair runs the meeting by)
 */
export function stageLabel(state: MeetingState): string {
  if (state.meetingStage === 'adjourned') return 'Adjourned';
  if (!state.meetingActive) return 'Not yet called to order';
  return state.currentAgendaItem?.title ?? 'In session';
}

export type StampOutcome = 'carried' | 'failed' | 'elected' | 'adopted' | 'sustained' | 'overruled';

/** A decision for the stamp: what it was, about what, and the tally */
export interface ResultView {
  outcome: StampOutcome;
  subject: string | null;
  tally: string | null;
  /** Changes with each decision, so the stamp lands again */
  key: string;
}

export function voteResultView(vote: VoteResult): ResultView {
  const outcome: StampOutcome =
    vote.outcome === 'SUSTAINED'
      ? 'sustained'
      : vote.outcome === 'OVERTURNED'
        ? 'overruled'
        : vote.passed
          ? 'carried'
          : 'failed';
  return {
    outcome,
    subject: vote.motionText || null,
    tally: vote.tally,
    key: `vote-${vote.timestamp}-${vote.tally}`,
  };
}

/**
 * An election's ballots by candidate, most first, a name written in on paper marked so:
 * "Carmen Diaz 9, Ray Castillo 5, Dan Ortiz (write-in) 1"
 */
export function electionTally(election: Election): string {
  const writeIns = new Set(election.candidates.filter((c) => c.writeIn).map((c) => c.name));
  return Object.entries(election.ballotResults)
    .sort(([, a], [, b]) => b - a)
    .map(([name, votes]) => `${name}${writeIns.has(name) ? ' (write-in)' : ''} ${votes}`)
    .join(', ');
}

/**
 * The declaration at this entry of the log: who the election has elected so far (several seats
 * stamp ELECTED at each declaration, naming everyone elected yet), with the tally of the ballot
 * that elected the last of them, or "By acclamation". It comes from the record, not the log line.
 */
function declaredResult(state: MeetingState, index: number): ResultView | null {
  const last = state.electedOfficers.at(-1);
  if (!last) return null;
  const together =
    last.electionId !== undefined
      ? state.electedOfficers.filter(
          (o) => o.electionId === last.electionId && o.position === last.position,
        )
      : [last];
  const ballot = last.ballots?.at(-1);
  const writeIns = new Set(last.ballotTotals?.at(-1)?.writeIns ?? []);
  const tally = last.acclamation
    ? 'By acclamation'
    : ballot
      ? Object.entries(ballot)
          .sort(([, a], [, b]) => b - a)
          .map(([name, votes]) => `${name}${writeIns.has(name) ? ' (write-in)' : ''} ${votes}`)
          .join(', ')
      : null;
  return {
    outcome: 'elected',
    subject: `${joinNames(together.map((o) => o.name))}, ${last.position}`,
    tally,
    key: `declared-${index}`,
  };
}

/**
 * The result the room should see, until the next question comes up: an election the chair
 * declared, the last vote, or a motion adopted by unanimous consent, whichever was latest. A
 * ruling of the chair, a motion that died for lack of a second or was withdrawn, and an election
 * set aside each take the last result down. Null while a question is pending (an election's
 * closed ballot too, until the chair declares the result), before anything is decided, and once
 * the meeting is adjourned.
 */
export function currentResult(state: MeetingState, vote: VoteResult | null): ResultView | null {
  if (state.meetingStage === 'adjourned') return null;
  const election = state.currentElection;
  const motionPending = state.votingOpen || !!state.pendingSecond || !!state.currentMotion;
  if (motionPending || state.nominationsOpen || election?.votingInProgress) return null;
  const decision = latestDecision(state.meetingLog);
  // A declaration stands while its election waits for the next one or the next ballot: each
  // seat filled is stamped as it is declared. An election for another office is the question.
  if (decision?.kind === 'declared') {
    const inHand = election?.position ?? state.currentNominationPosition;
    const declaredFor = state.electedOfficers.at(-1)?.position;
    return inHand && inHand !== declaredFor ? null : declaredResult(state, decision.index);
  }
  // Otherwise an election in hand (nominations closed, a closed ballot) is the question
  if (election || state.currentNominationPosition) return null;
  switch (decision?.kind) {
    case 'vote':
      return vote ? voteResultView(vote) : null;
    case 'consent':
      return {
        outcome: 'adopted',
        // The consent's line doesn't say which motion: the stamp says how it was adopted
        subject: null,
        tally: 'By unanimous consent',
        key: `consent-${decision.index}`,
      };
    default:
      return null;
  }
}

/** When the meeting adjourned, by the chair's clock, without the seconds: "8:42 PM" */
export function adjournedAt(state: MeetingState): string | null {
  const entry = state.meetingLog.findLast((e) => e.message === LOG_MEETING_ADJOURNED);
  return entry ? formatClockTime(entry.time) : null;
}

/**
 * How many things the meeting decided: votes, unanimous consents and elections. Motions
 * withdrawn or dead for want of a second are on the record too, but decided nothing.
 */
export function itemsDecided(state: MeetingState): number {
  const decided = state.completedMotions.filter(
    (m) => m.disposition !== 'withdrawn' && m.disposition !== 'no-second',
  ).length;
  return decided + state.electedOfficers.length;
}
