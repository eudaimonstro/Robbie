import type { MeetingState, MeetingAction, MeetingLogEntry } from '../types/index.js';
import {
  meetingLifecycleHandler,
  speakerHandler,
  agendaHandler,
  memberHandler,
  attendanceHandler,
  settingsHandler,
  motionHandler,
  votingHandler,
  consentHandler,
  electionHandler,
  inquiryHandler,
  rulingHandler,
} from './handlers/index.js';

/**
 * A request for unanimous consent is on the question the chair named (RONR 4:58): it ends when a
 * vote opens, a motion is made, or the question pending changes, so a later question is never
 * adopted without the room being asked
 */
function settleConsent(state: MeetingState): MeetingState {
  if (!state.unanimousConsentPending) return state;
  const asked = state.consentMotionId ?? state.currentMotion?.id;
  const stillAsked =
    !state.votingOpen &&
    !state.pendingSecond &&
    !!state.currentMotion &&
    state.currentMotion.id === asked;
  return stillAsked ? state : { ...state, unanimousConsentPending: false, consentMotionId: null };
}

/**
 * What leaves a declared voice vote open to a division (RONR 29:7): the room's count and roles,
 * hands, questions to the chair, timers, and the server's own bookkeeping. Changing the way the
 * next vote is taken is the meeting moving on. Anything else is
 * the meeting moving on, and it is too late.
 */
const KEEPS_DIVISION_OPEN: ReadonlySet<MeetingAction['type']> = new Set<MeetingAction['type']>([
  'CLOSE_VOTING',
  'ADD_MEMBER',
  'SET_MEMBER_PRESENCE',
  'REFRESH_MEMBERS',
  'SET_MEETING_INFO',
  'SET_BOARD',
  'SET_PREVIOUS_MINUTES',
  'SET_MEMBER_ROLE',
  'MARK_PRESENT',
  'MARK_ABSENT',
  'SET_HEADCOUNT',
  'SET_QUORUM',
  'RAISE_HAND',
  'LOWER_HAND',
  'ASK_INQUIRY',
  'ANSWER_INQUIRY',
  'SET_SPEAKER_TIME_LIMIT',
  'SET_VOTE_TIME_LIMIT',
  'SET_AUTO_YIELD',
]);

function settleDivision(state: MeetingState, action: MeetingAction): MeetingState {
  if (!state.voiceVote || KEEPS_DIVISION_OPEN.has(action.type)) return state;
  return { ...state, voiceVote: null };
}

export function meetingReducer(state: MeetingState, action: MeetingAction): MeetingState {
  return settleDivision(settleConsent(applyAction(state, action)), action);
}

function applyAction(state: MeetingState, action: MeetingAction): MeetingState {
  const log = (timestamp: string, msg: string): MeetingLogEntry[] => [
    ...state.meetingLog,
    { time: timestamp, message: msg },
  ];

  switch (action.type) {
    // Meeting lifecycle
    case 'START_MEETING':
    case 'END_MEETING':
    case 'SET_MEETING_INFO':
    case 'SET_BOARD':
    case 'RESUME_MEETING':
      return meetingLifecycleHandler(state, action, log);

    // Motions
    case 'MAKE_MOTION':
    case 'MAKE_FLOOR_MOTION':
    case 'SECOND_MOTION':
    case 'SECOND_FROM_FLOOR':
    case 'DECLINE_SECOND':
    case 'WITHDRAW_MOTION':
    case 'TAKE_UP_POSTPONED':
      return motionHandler(state, action, log);

    // Voting
    case 'OPEN_VOTING':
    case 'CAST_VOTE':
    case 'CLOSE_VOTING':
    case 'SET_FLOOR_TALLY':
    case 'REQUEST_DIVISION':
      return votingHandler(state, action, log);

    // Unanimous consent
    case 'REQUEST_UNANIMOUS_CONSENT':
    case 'OBJECT_TO_CONSENT':
    case 'UNANIMOUS_CONSENT_PASSED':
      return consentHandler(state, action, log);

    // Speaker management
    case 'RAISE_HAND':
    case 'LOWER_HAND':
    case 'RECOGNIZE_SPEAKER':
    case 'YIELD_FLOOR':
      return speakerHandler(state, action, log);

    // Agenda
    case 'ADD_AGENDA_ITEM':
    case 'REMOVE_AGENDA_ITEM':
    case 'REORDER_AGENDA':
    case 'ADOPT_AGENDA':
    case 'AGENDA_OBJECTION':
    case 'CALL_AGENDA_ITEM':
    case 'COMPLETE_AGENDA_ITEM':
    case 'RELOAD_AGENDA':
      return agendaHandler(state, action, log);

    // Settings
    case 'SET_SPEAKER_TIME_LIMIT':
    case 'SET_VOTE_TIME_LIMIT':
    case 'SET_VOTING_METHOD':
    case 'APPROVE_MINUTES':
    case 'SET_PREVIOUS_MINUTES':
    case 'SET_AUTO_YIELD':
    case 'SET_QUORUM':
      return settingsHandler(state, action, log);

    // Elections
    case 'OPEN_NOMINATIONS':
    case 'NOMINATE':
    case 'DECLINE_NOMINATION':
    case 'CLOSE_NOMINATIONS':
    case 'START_ELECTION':
    case 'CAST_BALLOT':
    case 'CLOSE_ELECTION':
    case 'SET_FLOOR_BALLOTS':
    case 'DECLARE_ELECTED':
    case 'ELECT_BY_ACCLAMATION':
    case 'SET_ASIDE_ELECTION':
      return electionHandler(state, action, log);

    // Inquiries
    case 'ASK_INQUIRY':
    case 'ANSWER_INQUIRY':
      return inquiryHandler(state, action, log);

    // Members
    case 'ADD_MEMBER':
    case 'SET_MEMBER_ROLE':
    case 'SET_MEMBER_PRESENCE':
    case 'REFRESH_MEMBERS':
      return memberHandler(state, action, log);

    // Attendance
    case 'MARK_PRESENT':
    case 'MARK_ABSENT':
    case 'SET_HEADCOUNT':
      return attendanceHandler(state, action, log);

    // The chair's ruling on a point of order
    case 'CHAIR_RULING':
      return rulingHandler(state, action, log);

    default: {
      // Exhaustive check - TypeScript will error here if any action type is unhandled
      const _exhaustiveCheck: never = action;
      // Runtime fallback for invalid actions (shouldn't happen with proper typing)
      return state;
    }
  }
}
