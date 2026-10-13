import type { LastStep, MeetingAction, MeetingLogEntry, MeetingState } from '../types/index.js';
import { stepName } from '../constants/stepNames.js';

/**
 * Undo (UNDO_LAST_STEP): the chair takes back their last step at the console, a button they
 * didn't mean to click, and the console is back where it was. It corrects the record rather than
 * deciding anything: the step leaves no record in the minutes, and the log says it was undone.
 *
 * Each action is one of:
 * - a step: the chair's own business at the console (or recorded for someone in the room), which
 *   the chair may undo until the meeting moves on
 * - keeps: what goes on around the business (votes and hands, presence, the room's count,
 *   settings, the server's bookkeeping), which leaves the last step open to undo
 * - ends: everything else, which moves the meeting on: a member's own business on their phone
 *   (never the chair's to erase), and what is done outside the meeting's state too (the call to
 *   order and adjournment, approving minutes, a role change, a bylaw amendment decided)
 *
 * A function decides an action shared with members by who sent it, or by what it decides.
 */
type UndoRule =
  'step' | 'keeps' | 'ends' | ((state: MeetingState, action: MeetingAction) => boolean);

/** Recorded for someone in the room: the chair's step; sent from a member's phone: theirs */
const fromFloor = (_state: MeetingState, action: MeetingAction) =>
  'fromFloor' in action && action.fromFloor === true;

/** A bylaw amendment decided is applied to the bylaws by the server: it can't be taken back */
const notBylawDecision = (state: MeetingState) => state.currentMotion?.type !== 'bylawAmendment';

/** An objection the chair recorded at the console, not a member's from their phone */
const byConsole = (state: MeetingState, action: MeetingAction) => {
  if (action.type !== 'AGENDA_OBJECTION') return false;
  const role = state.members.find((m) => m.id === action.objectorId)?.role;
  return role === 'chair' || role === 'admin';
};

export const UNDO_RULES: Record<MeetingAction['type'], UndoRule> = {
  START_MEETING: 'ends',
  END_MEETING: 'ends',
  OPEN_VOTING: 'step',
  CLOSE_VOTING: notBylawDecision,
  SET_FLOOR_TALLY: 'keeps',
  RECOGNIZE_SPEAKER: 'step',
  CHAIR_RULING: 'step',
  ADOPT_AGENDA: 'step',
  WITHDRAW_AGENDA_OBJECTION: 'step',
  CALL_AGENDA_ITEM: 'step',
  COMPLETE_AGENDA_ITEM: 'step',
  REQUEST_UNANIMOUS_CONSENT: 'step',
  UNANIMOUS_CONSENT_PASSED: notBylawDecision,
  SET_QUORUM: 'keeps',
  APPROVE_MINUTES: 'ends',
  OPEN_NOMINATIONS: 'step',
  CLOSE_NOMINATIONS: 'step',
  START_ELECTION: 'step',
  CLOSE_ELECTION: 'step',
  SET_FLOOR_BALLOTS: 'keeps',
  DECLARE_ELECTED: 'step',
  ELECT_BY_ACCLAMATION: 'step',
  SET_ASIDE_ELECTION: 'step',
  TAKE_UP_POSTPONED: 'step',
  RESUME_MEETING: 'step',
  ANSWER_INQUIRY: 'keeps',
  MARK_ABSENT: 'keeps',
  MARK_PRESENT: 'keeps',
  SET_HEADCOUNT: 'keeps',
  SET_AUTO_YIELD: 'keeps',
  MAKE_FLOOR_MOTION: 'step',
  SECOND_FROM_FLOOR: 'step',
  SET_SPEAKER_TIME_LIMIT: 'keeps',
  SET_VOTE_TIME_LIMIT: 'keeps',
  SET_VOTING_METHOD: 'keeps',
  // Changing the agenda before the meeting is undone by changing it back
  ADD_AGENDA_ITEM: 'ends',
  REMOVE_AGENDA_ITEM: 'ends',
  REORDER_AGENDA: 'ends',
  RELOAD_AGENDA: 'ends',
  SET_MEMBER_ROLE: 'ends',
  ADD_MEMBER: 'keeps',
  SET_MEMBER_PRESENCE: 'keeps',
  REFRESH_MEMBERS: 'keeps',
  SET_MEETING_INFO: 'keeps',
  SET_BOARD: 'keeps',
  SET_PREVIOUS_MINUTES: 'keeps',
  MAKE_MOTION: 'ends',
  SECOND_MOTION: 'ends',
  DECLINE_SECOND: 'step',
  CAST_VOTE: 'keeps',
  OBJECT_TO_CONSENT: fromFloor,
  AGENDA_OBJECTION: byConsole,
  NOMINATE: fromFloor,
  DECLINE_NOMINATION: 'ends',
  CAST_BALLOT: 'keeps',
  WITHDRAW_MOTION: fromFloor,
  REQUEST_DIVISION: fromFloor,
  RAISE_HAND: 'keeps',
  LOWER_HAND: 'keeps',
  YIELD_FLOOR: 'keeps',
  ASK_INQUIRY: 'keeps',
  // Undoing is never a step of its own: undoing it again would redo
  UNDO_LAST_STEP: 'ends',
};

/**
 * Fields a step's undo never puts back: the log keeps the step and says it was undone, and who
 * is here is the room's, not the step's
 */
const NOT_RESTORED: ReadonlySet<string> = new Set([
  'meetingLog',
  'lastStep',
  'members',
  'attendedIds',
]);

function isStep(state: MeetingState, action: MeetingAction): boolean {
  const rule = UNDO_RULES[action.type];
  return typeof rule === 'function' ? rule(state, action) : rule === 'step';
}

/** The fields the step changed, as they were before it (a shallow comparison, as the reducer keeps what it doesn't change) */
function recordStep(before: MeetingState, after: MeetingState, type: LastStep['type']): LastStep {
  const undo: Record<string, unknown> = {};
  const added: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (NOT_RESTORED.has(key)) continue;
    const was = before[key as keyof MeetingState];
    if (was === after[key as keyof MeetingState]) continue;
    if (was === undefined) added.push(key);
    else undo[key] = was;
  }
  return { type, undo: undo as Partial<MeetingState>, ...(added.length > 0 && { added }) };
}

/**
 * The last step after an action: recorded for a step, kept while the meeting goes on around it,
 * and gone once the meeting moves on
 */
export function settleLastStep(
  before: MeetingState,
  after: MeetingState,
  action: MeetingAction,
): MeetingState {
  if (action.type === 'UNDO_LAST_STEP') return after;
  // A step the reducer refused changes nothing, and leaves the one before it
  if (after === before) return after;
  if (isStep(before, action)) return { ...after, lastStep: recordStep(before, after, action.type) };
  if (UNDO_RULES[action.type] === 'keeps' || !after.lastStep) return after;
  return { ...after, lastStep: null };
}

/**
 * The state before the last step, with what has gone on since kept: votes and hands, presence,
 * the log (which says the step was undone). Hands raised since stay up after the ones the step
 * took down, as when a division undoes a declared vote.
 */
export function undoLastStep(
  state: MeetingState,
  log: (timestamp: string, message: string) => MeetingLogEntry[],
  timestamp: string,
): MeetingState {
  const step = state.lastStep;
  if (!step?.undo) return state;
  const restored: Record<string, unknown> = { ...state, ...step.undo };
  for (const key of step.added ?? []) delete restored[key];
  const queue = step.undo.speakerQueue;
  if (queue) {
    const raisedSince = state.speakerQueue.filter(
      (entry) => !queue.some((e) => e.member.id === entry.member.id),
    );
    restored.speakerQueue = [...queue, ...raisedSince];
  }
  return {
    ...(restored as unknown as MeetingState),
    lastStep: null,
    meetingLog: log(timestamp, `The chair undid "${stepName(step.type)}".`),
  };
}
