import type { MeetingState, MeetingAction, MeetingLogEntry } from '../types/index.js';
import {
  meetingLifecycleHandler,
  speakerHandler,
  agendaHandler,
  memberHandler,
  rollCallHandler,
  settingsHandler,
  motionHandler,
  votingHandler,
  consentHandler,
  electionHandler,
  inquiryHandler,
  ruleSuspensionHandler,
  committeeHandler,
  proxyHandler,
} from './handlers/index.js';

export function meetingReducer(state: MeetingState, action: MeetingAction): MeetingState {
  const log = (timestamp: string, msg: string): MeetingLogEntry[] => [
    ...state.meetingLog,
    { time: timestamp, message: msg },
  ];

  switch (action.type) {
    // Meeting lifecycle
    case 'START_MEETING':
    case 'END_MEETING':
    case 'ADVANCE_MEETING_STAGE':
    case 'SET_MEETING_STAGE':
      return meetingLifecycleHandler(state, action, log);

    // Motions
    case 'MAKE_MOTION':
    case 'SECOND_MOTION':
    case 'DECLINE_SECOND':
    case 'WITHDRAW_MOTION':
    case 'MODIFY_MOTION':
      return motionHandler(state, action, log);

    // Voting
    case 'OPEN_VOTING':
    case 'CAST_VOTE':
    case 'CLOSE_VOTING':
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
    case 'DECLARE_ELECTED':
      return electionHandler(state, action, log);

    // Inquiries
    case 'ASK_INQUIRY':
    case 'ANSWER_INQUIRY':
      return inquiryHandler(state, action, log);

    // Members
    case 'ADD_MEMBER':
    case 'SET_MEMBER_ROLE':
    case 'SET_MEMBER_PRESENCE':
    case 'RENAME_MEMBER':
      return memberHandler(state, action, log);

    // Roll call
    case 'START_ROLL_CALL':
    case 'RESPOND_ROLL_CALL':
    case 'COMPLETE_ROLL_CALL':
    case 'MARK_ABSENT':
      return rollCallHandler(state, action, log);

    // Rule suspension
    case 'SUSPEND_RULE_APPROVED':
    case 'RESTORE_RULE':
    case 'CHAIR_RULING':
      return ruleSuspensionHandler(state, action, log);

    // Committee reports
    case 'ADD_COMMITTEE_REPORT':
    case 'PRESENT_COMMITTEE_REPORT':
      return committeeHandler(state, action, log);

    // Proxy voting
    case 'SET_PROXY_SETTINGS':
    case 'GRANT_PROXY':
    case 'REVOKE_PROXY':
    case 'CAST_PROXY_VOTE':
    case 'REQUEST_PROXY':
    case 'ACCEPT_PROXY':
    case 'DECLINE_PROXY':
    case 'CANCEL_PROXY_REQUEST':
      return proxyHandler(state, action, log);

    default: {
      // Exhaustive check - TypeScript will error here if any action type is unhandled
      const _exhaustiveCheck: never = action;
      // Runtime fallback for invalid actions (shouldn't happen with proper typing)
      return state;
    }
  }
}
