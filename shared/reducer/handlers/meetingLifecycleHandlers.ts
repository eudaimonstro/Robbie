import type { MeetingState, MeetingAction } from '../../types/index.js';
import { getNextStage, getStageLogMessage } from '../../constants/meetingStages.js';
import {
  LOG_MEETING_CALLED_TO_ORDER,
  LOG_MEETING_ADJOURNED
} from '../../constants/logMessages.js';
import type { ActionHandler } from './types.js';

type LifecycleAction = Extract<MeetingAction,
  | { type: 'START_MEETING' }
  | { type: 'END_MEETING' }
  | { type: 'ADVANCE_MEETING_STAGE' }
>;

export const meetingLifecycleHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'START_MEETING':
      return {
        ...state,
        meetingActive: true,
        meetingStage: 'call-to-order',
        meetingCode: (action as Extract<MeetingAction, { type: 'START_MEETING' }>).meetingCode,
        meetingLog: log((action as Extract<MeetingAction, { type: 'START_MEETING' }>).timestamp, LOG_MEETING_CALLED_TO_ORDER)
      };

    case 'END_MEETING':
      return {
        ...state,
        meetingActive: false,
        meetingStage: 'adjourned',
        suspendedRules: [],
        meetingLog: log((action as Extract<MeetingAction, { type: 'END_MEETING' }>).timestamp, LOG_MEETING_ADJOURNED)
      };

    case 'ADVANCE_MEETING_STAGE': {
      const typedAction = action as Extract<MeetingAction, { type: 'ADVANCE_MEETING_STAGE' }>;
      const nextStage = getNextStage(state.meetingStage);
      if (!nextStage) return state;
      const stageMessage = getStageLogMessage(nextStage);
      return {
        ...state,
        meetingStage: nextStage,
        meetingLog: stageMessage ? log(typedAction.timestamp, stageMessage) : state.meetingLog
      };
    }

    default:
      return undefined;
  }
};
