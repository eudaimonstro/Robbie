import type { AgendaItem, MeetingAction } from '../../types/index.js';
import {
  getNextStage,
  getStageLogMessage,
  isLastActiveStage,
} from '../../constants/meetingStages.js';
import {
  LOG_MEETING_CALLED_TO_ORDER,
  LOG_MEETING_ADJOURNED,
  logAgendaItemCompleted,
} from '../../constants/logMessages.js';
import type { ActionHandler } from './types.js';

/** The agenda items that mark the start and end of the meeting, by title */
const CALL_TO_ORDER = /^call to order$/i;
const ADJOURNMENT = /^adjournment$/i;

export const meetingLifecycleHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'START_MEETING': {
      const { timestamp } = action as Extract<MeetingAction, { type: 'START_MEETING' }>;
      const started = log(timestamp, LOG_MEETING_CALLED_TO_ORDER);
      // Calling the meeting to order is the agenda's first item, when it has one: it is done
      // (only while pending, as a meeting called to order again after adjourning has done it)
      const first = state.agenda[0];
      if (first && first.status === 'pending' && CALL_TO_ORDER.test(first.title.trim())) {
        return {
          ...state,
          meetingActive: true,
          meetingStage: 'call-to-order',
          agenda: state.agenda.map((a) =>
            a.id === first.id ? { ...a, status: 'completed' as const } : a,
          ),
          meetingLog: [
            ...started,
            { time: timestamp, message: logAgendaItemCompleted(first.title) },
          ],
        };
      }
      return {
        ...state,
        meetingActive: true,
        meetingStage: 'call-to-order',
        meetingLog: started,
      };
    }

    case 'END_MEETING': {
      const { timestamp } = action as Extract<MeetingAction, { type: 'END_MEETING' }>;
      // Adjourning completes the agenda item under way, so the record doesn't leave it open,
      // and the "Adjournment" item, which adjourning is
      const item = state.currentAgendaItem;
      const completes = (a: AgendaItem) =>
        a.id === item?.id || (a.status === 'pending' && ADJOURNMENT.test(a.title.trim()));
      const completed = state.agenda.filter(completes);
      return {
        ...state,
        meetingActive: false,
        meetingStage: 'adjourned',
        suspendedRules: [],
        currentAgendaItem: null,
        agenda: state.agenda.map((a) =>
          completes(a) ? { ...a, status: 'completed' as const } : a,
        ),
        meetingLog: [
          ...state.meetingLog,
          ...completed.map((a) => ({ time: timestamp, message: logAgendaItemCompleted(a.title) })),
          { time: timestamp, message: LOG_MEETING_ADJOURNED },
        ],
      };
    }

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
