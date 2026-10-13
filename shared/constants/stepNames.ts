import type { MeetingAction } from '../types/index.js';

/**
 * What the chair's last step was, for "Undo ..." on the console and the log. Each names the step
 * as something done ("adopting the agenda"), never as the button that does it ("Adopt the
 * agenda"), so the two read apart, to a screen reader as well.
 */
export const STEP_NAMES: Partial<Record<MeetingAction['type'], string>> = {
  OPEN_VOTING: 'opening the vote',
  CLOSE_VOTING: 'closing the vote',
  RECOGNIZE_SPEAKER: 'recognizing the speaker',
  CHAIR_RULING: 'the ruling',
  ADOPT_AGENDA: 'adopting the agenda',
  WITHDRAW_AGENDA_OBJECTION: 'withdrawing the objection',
  CALL_AGENDA_ITEM: 'calling the item',
  COMPLETE_AGENDA_ITEM: 'completing the item',
  REQUEST_UNANIMOUS_CONSENT: 'asking for unanimous consent',
  UNANIMOUS_CONSENT_PASSED: 'adopting it without objection',
  OPEN_NOMINATIONS: 'opening nominations',
  CLOSE_NOMINATIONS: 'closing nominations',
  START_ELECTION: 'opening the ballot',
  CLOSE_ELECTION: 'closing the ballot',
  DECLARE_ELECTED: 'declaring the winner',
  ELECT_BY_ACCLAMATION: 'electing by acclamation',
  SET_ASIDE_ELECTION: 'setting the election aside',
  TAKE_UP_POSTPONED: 'taking up the postponed question',
  RESUME_MEETING: 'resuming the meeting',
  MAKE_FLOOR_MOTION: 'recording the motion from the floor',
  SECOND_FROM_FLOOR: 'recording the second',
  DECLINE_SECOND: 'declaring no second',
  OBJECT_TO_CONSENT: 'recording the objection',
  AGENDA_OBJECTION: 'recording the agenda objection',
  NOMINATE: 'recording the nomination',
  WITHDRAW_MOTION: 'recording the withdrawal',
  REQUEST_DIVISION: 'recording the division',
};

export function stepName(type: MeetingAction['type']): string {
  return STEP_NAMES[type] ?? 'the last step';
}
