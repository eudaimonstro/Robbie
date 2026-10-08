import type { MeetingAction } from '../../types/index.js';
import {
  LOG_AGENDA_ADOPTED,
  LOG_AGENDA_OBJECTION,
  logAgendaItemCalled,
  logAgendaItemCompleted,
} from '../../constants/logMessages.js';
import type { ActionHandler } from './types.js';
import { moveItem } from '../../utils/moveItem.js';
import { FORUM_ENDS } from './motionHandlers.js';

export const agendaHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'ADD_AGENDA_ITEM': {
      const typedAction = action as Extract<MeetingAction, { type: 'ADD_AGENDA_ITEM' }>;
      return {
        ...state,
        agenda: [
          ...state.agenda,
          { id: typedAction.itemId, title: typedAction.title, status: 'pending' as const },
        ],
      };
    }

    case 'REMOVE_AGENDA_ITEM': {
      const typedAction = action as Extract<MeetingAction, { type: 'REMOVE_AGENDA_ITEM' }>;
      return {
        ...state,
        agenda: state.agenda.filter((item) => item.id !== typedAction.id),
      };
    }

    case 'REORDER_AGENDA': {
      const typedAction = action as Extract<MeetingAction, { type: 'REORDER_AGENDA' }>;
      return {
        ...state,
        agenda: moveItem(state.agenda, typedAction.fromIndex, typedAction.toIndex),
      };
    }

    case 'ADOPT_AGENDA': {
      const typedAction = action as Extract<MeetingAction, { type: 'ADOPT_AGENDA' }>;
      return {
        ...state,
        agendaAdopted: true,
        agendaObjection: false,
        // Without objection, as the minutes say
        agendaAdoption: {
          how: 'consent',
          ...(typedAction.at ? { decidedAt: typedAction.at } : {}),
        },
        meetingLog: log(typedAction.timestamp, LOG_AGENDA_ADOPTED),
      };
    }

    case 'AGENDA_OBJECTION': {
      const typedAction = action as Extract<MeetingAction, { type: 'AGENDA_OBJECTION' }>;
      return {
        ...state,
        agendaObjection: true,
        meetingLog: log(typedAction.timestamp, LOG_AGENDA_OBJECTION),
      };
    }

    case 'CALL_AGENDA_ITEM': {
      const typedAction = action as Extract<MeetingAction, { type: 'CALL_AGENDA_ITEM' }>;
      const item = state.agenda.find((a) => a.id === typedAction.id);
      const updatedAgenda = state.agenda.map((a) =>
        a.id === typedAction.id
          ? { ...a, status: 'active' as const }
          : a.status === 'active'
            ? { ...a, status: 'pending' as const }
            : a,
      );
      return {
        ...state,
        // The open forum of the item before ends with it, and the time to appeal a ruling
        ...(!state.currentMotion && FORUM_ENDS),
        lastChairRuling: null,
        // The updated entry, so its status reads 'active' here as in the agenda
        currentAgendaItem: updatedAgenda.find((a) => a.id === typedAction.id) ?? null,
        agenda: updatedAgenda,
        meetingLog: log(typedAction.timestamp, logAgendaItemCalled(item?.title)),
      };
    }

    case 'RELOAD_AGENDA': {
      const typedAction = action as Extract<MeetingAction, { type: 'RELOAD_AGENDA' }>;
      // Before the meeting starts: the agenda as scheduled, not yet adopted
      return {
        ...state,
        agenda: typedAction.agenda,
        agendaAdopted: false,
        agendaObjection: false,
        currentAgendaItem: null,
      };
    }

    case 'COMPLETE_AGENDA_ITEM': {
      const typedAction = action as Extract<MeetingAction, { type: 'COMPLETE_AGENDA_ITEM' }>;
      const updatedAgenda = state.agenda.map((a) =>
        a.id === typedAction.id ? { ...a, status: 'completed' as const } : a,
      );
      const completed = state.agenda.find((a) => a.id === typedAction.id);
      return {
        ...state,
        ...(!state.currentMotion && FORUM_ENDS),
        lastChairRuling: null,
        currentAgendaItem:
          state.currentAgendaItem?.id === typedAction.id ? null : state.currentAgendaItem,
        agenda: updatedAgenda,
        meetingLog: log(typedAction.timestamp, logAgendaItemCompleted(completed?.title)),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
