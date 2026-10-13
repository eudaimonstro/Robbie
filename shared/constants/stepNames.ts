import type { MeetingAction } from '../types/index.js';

/** What the console calls each step, for "Undo: ..." and the log */
export const STEP_NAMES: Partial<Record<MeetingAction['type'], string>> = {
  OPEN_VOTING: 'Open the vote',
  CLOSE_VOTING: 'Close the vote',
  RECOGNIZE_SPEAKER: 'Recognize the speaker',
  CHAIR_RULING: 'The ruling',
  ADOPT_AGENDA: 'Adopt the agenda',
  WITHDRAW_AGENDA_OBJECTION: 'The objection is withdrawn',
  CALL_AGENDA_ITEM: 'Call the item',
  COMPLETE_AGENDA_ITEM: 'Complete the item',
  REQUEST_UNANIMOUS_CONSENT: 'Ask for unanimous consent',
  UNANIMOUS_CONSENT_PASSED: 'No objection',
  OPEN_NOMINATIONS: 'Open nominations',
  CLOSE_NOMINATIONS: 'Close nominations',
  START_ELECTION: 'Open the ballot',
  CLOSE_ELECTION: 'Close the ballot',
  DECLARE_ELECTED: 'Declare elected',
  ELECT_BY_ACCLAMATION: 'Elect by acclamation',
  SET_ASIDE_ELECTION: 'Set the election aside',
  TAKE_UP_POSTPONED: 'Take up the postponed question',
  RESUME_MEETING: 'Resume the meeting',
  MAKE_FLOOR_MOTION: 'A motion from the floor',
  SECOND_FROM_FLOOR: 'Seconded from the floor',
  DECLINE_SECOND: 'No second',
  OBJECT_TO_CONSENT: 'Objection from the floor',
  AGENDA_OBJECTION: 'Objection to the agenda',
  NOMINATE: 'Nomination from the floor',
  WITHDRAW_MOTION: 'The mover withdraws it',
  REQUEST_DIVISION: 'Division called from the floor',
};

export function stepName(type: MeetingAction['type']): string {
  return STEP_NAMES[type] ?? 'The last step';
}
