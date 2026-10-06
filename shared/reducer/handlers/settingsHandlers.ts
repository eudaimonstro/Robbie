import type { MeetingAction } from '../../types/index.js';
import { LOG_MINUTES_APPROVED, logQuorumChanged } from '../../constants/logMessages.js';
import type { ActionHandler } from './types.js';

export const settingsHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'SET_SPEAKER_TIME_LIMIT': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_SPEAKER_TIME_LIMIT' }>;
      return { ...state, speakerTimeLimit: typedAction.seconds };
    }

    case 'SET_VOTE_TIME_LIMIT': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_VOTE_TIME_LIMIT' }>;
      return { ...state, voteTimeLimit: typedAction.seconds };
    }

    case 'SET_VOTING_METHOD': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_VOTING_METHOD' }>;
      return { ...state, votingMethod: typedAction.method };
    }

    case 'APPROVE_MINUTES': {
      const typedAction = action as Extract<MeetingAction, { type: 'APPROVE_MINUTES' }>;
      return {
        ...state,
        minutesApproved: true,
        meetingLog: log(typedAction.timestamp, LOG_MINUTES_APPROVED),
      };
    }

    case 'SET_PREVIOUS_MINUTES': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_PREVIOUS_MINUTES' }>;
      return { ...state, minutesFromPreviousMeeting: typedAction.minutes };
    }

    case 'SET_AUTO_YIELD': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_AUTO_YIELD' }>;
      return { ...state, autoYieldOnTimeExpired: typedAction.enabled };
    }

    case 'SET_QUORUM': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_QUORUM' }>;
      return {
        ...state,
        quorum: typedAction.quorum,
        meetingLog: log(typedAction.timestamp, logQuorumChanged(typedAction.quorum)),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
