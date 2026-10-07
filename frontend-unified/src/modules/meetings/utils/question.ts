import { LOG_MEETING_ADJOURNED, PUT_BY_CHAIR } from '@robbie-bylawyer/shared/constants';
import type { Election, MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import type { VoteResult } from '../hooks/useVoteResults';
import { formatClockTime } from '../../../utils/dates';

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
  /** Moved and waiting for a second */
  awaitingSecond: boolean;
  /** Questions pending beneath it, the nearest first */
  beneath: string[];
  /** Changes when the question does, so the card crossfades */
  key: string;
}

const REQUIREMENTS = { majority: 'Majority', '2/3': 'Two thirds', plurality: 'Plurality' } as const;

function requirementOf(vote: Motion['vote'] | Election['requiredVotes']): string | null {
  return vote === 'none' ? null : REQUIREMENTS[vote];
}

/**
 * Who brought the motion: "Moved by Alice Brennan", "Moved from the floor by Carmen Diaz", or
 * "Put by the chair" for a question the chair puts from the agenda (it has no mover)
 */
export function moverLine(motion: Pick<Motion, 'mover' | 'fromFloor' | 'putByChair'>): string {
  if (motion.putByChair) return PUT_BY_CHAIR;
  return motion.fromFloor ? `Moved from the floor by ${motion.mover}` : `Moved by ${motion.mover}`;
}

function beneathLine(motion: Motion): string {
  return `${motion.name}: ${motion.text}`;
}

/** Who stands for the position nominations are (or were) open for, declined nominees left out */
export function nomineesFor(state: MeetingState, position: string): string[] {
  return [
    ...new Set(
      state.nominations
        .filter((n) => n.position === position && !n.declined)
        .map((n) => n.nomineeName),
    ),
  ];
}

/**
 * The question before the assembly, or null when nothing is pending (or the meeting adjourned). A
 * motion made during an election (only a privileged or incidental one is in order then) comes
 * before the election it interrupts.
 */
export function describeQuestion(state: MeetingState): QuestionView | null {
  if (state.meetingStage === 'adjourned') return null;

  if (state.pendingSecond) {
    const motion = state.pendingSecond;
    return {
      kind: motion.name,
      text: motion.text,
      byline: `${moverLine(motion)}, awaiting a second`,
      requirement: requirementOf(motion.vote),
      awaitingSecond: true,
      beneath: [...state.motionStack].reverse().map(beneathLine),
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
      requirement: requirementOf(motion.vote),
      awaitingSecond: false,
      beneath: state.motionStack
        .filter((m) => m.id !== motion.id)
        .reverse()
        .map(beneathLine),
      key: `motion-${motion.id}`,
    };
  }

  const election = state.currentElection;
  if (election?.votingInProgress) {
    return {
      kind: `Election for ${election.position}`,
      text: election.candidates.map((c) => c.name).join(', ') || 'No candidates',
      byline: 'Ballot in progress',
      requirement: requirementOf(election.requiredVotes),
      awaitingSecond: false,
      beneath: [],
      key: `election-${election.id}`,
    };
  }

  // Nominations open, or closed with the ballot still to open
  if (state.currentNominationPosition && !election) {
    const position = state.currentNominationPosition;
    const nominees = nomineesFor(state, position);
    const open = state.nominationsOpen;
    return {
      kind: `Election for ${position}`,
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

export type StampOutcome = 'carried' | 'failed' | 'elected';

/** A decision for the stamp: what it was, about what, and the tally */
export interface ResultView {
  outcome: StampOutcome;
  subject: string | null;
  tally: string | null;
  /** Changes with each decision, so the stamp lands again */
  key: string;
}

export function voteResultView(vote: VoteResult): ResultView {
  return {
    outcome: vote.passed ? 'carried' : 'failed',
    subject: vote.motionText || null,
    tally: vote.tally,
    key: `vote-${vote.timestamp}-${vote.tally}`,
  };
}

/** An election's ballots by candidate, most first: "Carmen Diaz 9, Ray Castillo 5" */
export function electionTally(election: Election): string {
  return Object.entries(election.ballotResults)
    .sort(([, a], [, b]) => b - a)
    .map(([name, votes]) => `${name} ${votes}`)
    .join(', ');
}

// The reducer's lines for an election: the ballot closed with a winner ("Voting closed for
// Director. Results: Carmen Diaz: 9 vote(s), Ray Castillo: 5 vote(s). Carmen Diaz elected."),
// then the chair's declaration ("Chair declares Carmen Diaz elected as Director.")
const DECLARED = /^Chair declares (.+?)(?: \(write-in candidate\))? elected as (.+)\.$/;
const BALLOT_CLOSED = /^Voting closed for (.+?)\. Results: (.*vote\(s\))\. .+ elected\.$/;
const BALLOT_COUNT = /(.+?): (\d+) vote\(s\)(?:, |$)/g;

/**
 * The election the chair declared last, with its tally from the closed ballot, when nothing has
 * been decided since: the election has left the state by then, but the room still reads it
 */
function declaredResult(state: MeetingState): ResultView | null {
  const log = state.meetingLog;
  const index = log.findLastIndex(
    (entry) =>
      DECLARED.test(entry.message) ||
      /^Vote: Yea \d+, Nay \d+\./.test(entry.message) ||
      entry.message.includes('CARRIED by unanimous consent'),
  );
  const declared = index >= 0 ? DECLARED.exec(log[index].message) : null;
  if (!declared) return null;
  const [, name, position] = declared;
  const closed = log
    .slice(0, index)
    .map((entry) => BALLOT_CLOSED.exec(entry.message))
    .findLast((match) => match?.[1] === position);
  const tally = closed
    ? [...closed[2].matchAll(BALLOT_COUNT)].map(([, who, votes]) => `${who} ${votes}`).join(', ')
    : null;
  return { outcome: 'elected', subject: `${name}, ${position}`, tally, key: `declared-${index}` };
}

/**
 * The result the room should see: an election just decided (and then declared), or else the
 * last vote, until the next question comes up. Null while a question is pending or before
 * anything is decided.
 */
export function currentResult(state: MeetingState, vote: VoteResult | null): ResultView | null {
  const election = state.currentElection;
  if (election && !election.votingInProgress && election.elected) {
    return {
      outcome: 'elected',
      subject: `${election.elected}, ${election.position}`,
      tally: electionTally(election),
      key: `election-${election.id}`,
    };
  }
  const questionPending =
    state.votingOpen ||
    !!state.pendingSecond ||
    !!state.currentMotion ||
    !!election?.votingInProgress ||
    // Nominations open, or closed with the ballot still to open
    state.nominationsOpen ||
    !!state.currentNominationPosition;
  if (questionPending) return null;
  // The vote, when it is the latest decision; a declaration after it replaces it
  if (vote) return voteResultView(vote);
  return election ? null : declaredResult(state);
}

/** When the meeting adjourned, by the chair's clock, without the seconds: "8:42 PM" */
export function adjournedAt(state: MeetingState): string | null {
  const entry = state.meetingLog.findLast((e) => e.message === LOG_MEETING_ADJOURNED);
  return entry ? formatClockTime(entry.time) : null;
}

/** How many things the meeting decided: votes, unanimous consents and elections */
export function itemsDecided(state: MeetingState): number {
  const consents = state.meetingLog.filter((e) =>
    e.message.startsWith('Motion CARRIED by unanimous consent'),
  ).length;
  return state.completedMotions.length + consents + state.electedOfficers.length;
}
