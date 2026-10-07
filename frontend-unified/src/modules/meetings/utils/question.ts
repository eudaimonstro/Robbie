import {
  DISPLAYABLE_STAGES,
  LOG_MEETING_ADJOURNED,
  PUT_BY_CHAIR,
} from '@robbie-bylawyer/shared/constants';
import type { Election, MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import type { VoteResult } from '../hooks/useVoteResults';

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

/** The question before the assembly, or null when nothing is pending */
export function describeQuestion(state: MeetingState): QuestionView | null {
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

  if (state.nominationsOpen && state.currentNominationPosition) {
    const position = state.currentNominationPosition;
    const nominees = state.nominations
      .filter((n) => n.position === position && !n.declined)
      .map((n) => n.nomineeName);
    return {
      kind: `Election for ${position}`,
      text: 'Nominations are open',
      byline: nominees.length > 0 ? `Nominated: ${nominees.join(', ')}` : 'No nominations yet',
      requirement: null,
      awaitingSecond: false,
      beneath: [],
      key: `nominations-${position}`,
    };
  }

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

  return null;
}

/** The stage of the meeting as a label for the top bar */
export function stageLabel(state: MeetingState): string {
  if (state.meetingStage === 'adjourned') return 'Adjourned';
  if (!state.meetingActive) return 'Not yet called to order';
  return DISPLAYABLE_STAGES.find((s) => s.stage === state.meetingStage)?.label ?? 'In session';
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

/**
 * The result the room should see: an election just decided, or else the last vote, until the
 * next question comes up. Null while a question is pending or before anything is decided.
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
    state.nominationsOpen;
  if (questionPending || !vote) return null;
  return voteResultView(vote);
}

/** When the meeting adjourned, by the chair's clock, without the seconds: "8:42 PM" */
export function adjournedAt(state: MeetingState): string | null {
  const entry = state.meetingLog.findLast((e) => e.message === LOG_MEETING_ADJOURNED);
  return entry ? entry.time.replace(/^(\d{1,2}:\d{2}):\d{2}/, '$1') : null;
}

/** How many things the meeting decided: votes, unanimous consents and elections */
export function itemsDecided(state: MeetingState): number {
  const consents = state.meetingLog.filter((e) =>
    e.message.startsWith('Motion CARRIED by unanimous consent'),
  ).length;
  return state.completedMotions.length + consents + state.electedOfficers.length;
}
