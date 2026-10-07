import type { DebateStance, MeetingState } from '@robbie-bylawyer/shared/types';

/** What the phone asks of its owner now: one thing at a time (docs/design-brief.md) */
export type PhoneMoment =
  | 'lobby'
  | 'adjourned'
  | 'voice-vote'
  | 'vote'
  | 'ballot'
  | 'nominate'
  | 'second'
  | 'consent'
  | 'agenda'
  | 'debate'
  | 'motion';

/** The moment for the phone's one action block, the most pressing first */
export function phoneMoment(state: MeetingState): PhoneMoment {
  if (state.meetingStage === 'adjourned') return 'adjourned';
  if (!state.meetingActive) return 'lobby';
  if (state.votingOpen) return state.votingMethod === 'voice' ? 'voice-vote' : 'vote';
  if (state.currentElection?.votingInProgress) return 'ballot';
  if (state.nominationsOpen) return 'nominate';
  if (state.pendingSecond) return 'second';
  if (state.unanimousConsentPending) return 'consent';
  if (!state.agendaAdopted && !state.agendaObjection && !state.currentMotion) return 'agenda';
  if (state.currentMotion?.debatable) return 'debate';
  return 'motion';
}

/** A speaker's position on the question, in words */
export const STANCE_LABELS: Record<DebateStance, string> = {
  pro: 'For',
  con: 'Against',
  neutral: 'Neutral',
};
