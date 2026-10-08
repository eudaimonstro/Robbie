import type { DebateStance, MeetingState } from '@robbie-bylawyer/shared/types';
import { electionUnderway } from './chairActions';
import { minutesItemUnderWay } from './minutesApproval';

/** What the phone asks of its owner now: one thing at a time (docs/design-brief.md) */
export type PhoneMoment =
  | 'lobby'
  | 'adjourned'
  | 'adjourning'
  | 'recess'
  | 'ruling'
  | 'voice-vote'
  | 'vote'
  | 'ballot'
  | 'nominate'
  | 'election'
  | 'second'
  | 'consent'
  | 'agenda'
  | 'debate'
  | 'debate-closed'
  | 'minutes'
  | 'motion';

/** The moment for the phone's one action block, the most pressing first */
export function phoneMoment(state: MeetingState): PhoneMoment {
  if (state.meetingStage === 'adjourned') return 'adjourned';
  if (!state.meetingActive) return 'lobby';
  if (state.adjournmentCarried) return 'adjourning';
  if (state.recess) return 'recess';
  // A point of order holds everything, a vote too, until the chair rules
  if (state.currentMotion?.vote === 'none') return 'ruling';
  if (state.votingOpen) return state.votingMethod === 'voice' ? 'voice-vote' : 'vote';
  if (state.currentElection?.votingInProgress) return 'ballot';
  if (state.nominationsOpen) return 'nominate';
  if (state.pendingSecond) return 'second';
  if (state.unanimousConsentPending) return 'consent';
  if (state.currentMotion?.debateClosed) return 'debate-closed';
  if (state.currentMotion?.debatable) return 'debate';
  // Nominations closed with the ballot still to open, or a winner awaiting the declaration: the
  // election holds the floor, and the phone waits for the chair
  if (electionUnderway(state)) return 'election';
  if (!state.agendaAdopted && !state.agendaObjection && !state.currentMotion) return 'agenda';
  // The previous minutes before the room: a member with a correction offers it aloud, so the
  // phone asks for no motion until they are approved
  if (minutesItemUnderWay(state) && !state.minutesApproved) return 'minutes';
  return 'motion';
}

/** A speaker's position on the question, in words */
export const STANCE_LABELS: Record<DebateStance, string> = {
  pro: 'For',
  con: 'Against',
  neutral: 'Neutral',
};

/**
 * A stance from the meeting's state, in words: looked up as an own key, so a value that isn't a
 * stance (the server refuses one, but the screens shouldn't depend on it) shows as Neutral
 * rather than reaching the prototype
 */
export function stanceLabel(stance: unknown): string {
  return typeof stance === 'string' && Object.hasOwn(STANCE_LABELS, stance)
    ? STANCE_LABELS[stance as DebateStance]
    : STANCE_LABELS.neutral;
}
