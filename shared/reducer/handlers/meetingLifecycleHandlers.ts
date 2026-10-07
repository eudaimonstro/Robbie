import type { MeetingAction } from '../../types/index.js';
import {
  getNextStage,
  getStageLogMessage,
  isLastActiveStage,
} from '../../constants/meetingStages.js';
import { LOG_MEETING_CALLED_TO_ORDER, LOG_MEETING_ADJOURNED } from '../../constants/logMessages.js';
import type { ActionHandler } from './types.js';

export const meetingLifecycleHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'START_MEETING':
      return {
        ...state,
        meetingActive: true,
        meetingStage: 'call-to-order',
        meetingLog: log(
          (action as Extract<MeetingAction, { type: 'START_MEETING' }>).timestamp,
          LOG_MEETING_CALLED_TO_ORDER,
        ),
      };

    case 'END_MEETING':
      return {
        ...state,
        meetingActive: false,
        meetingStage: 'adjourned',
        suspendedRules: [],
        meetingLog: log(
          (action as Extract<MeetingAction, { type: 'END_MEETING' }>).timestamp,
          LOG_MEETING_ADJOURNED,
        ),
      };

    case 'SET_MEETING_INFO': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_MEETING_INFO' }>;
      return {
        ...state,
        organizationId: typedAction.organizationId,
        title: typedAction.title,
        scheduledFor: typedAction.scheduledFor,
      };
    }

    case 'ADVANCE_MEETING_STAGE': {
      const typedAction = action as Extract<MeetingAction, { type: 'ADVANCE_MEETING_STAGE' }>;
      // Adjourning ends the meeting (END_MEETING), so advancing stops at the last stage of
      // business rather than moving to 'adjourned' with the meeting still active
      if (isLastActiveStage(state.meetingStage) || state.meetingStage === 'adjourned') {
        return state;
      }
      const nextStage = getNextStage(state.meetingStage);
      if (!nextStage) return state;
      const stageMessage = getStageLogMessage(nextStage);
      return {
        ...state,
        meetingStage: nextStage,
        meetingLog: stageMessage ? log(typedAction.timestamp, stageMessage) : state.meetingLog,
      };
    }

    case 'SET_MEETING_STAGE': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_MEETING_STAGE' }>;
      if (typedAction.stage === state.meetingStage) return state;
      const stageMessage = getStageLogMessage(typedAction.stage);
      return {
        ...state,
        meetingStage: typedAction.stage,
        meetingLog: stageMessage ? log(typedAction.timestamp, stageMessage) : state.meetingLog,
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
