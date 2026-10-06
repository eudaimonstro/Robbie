import type { MeetingState, MeetingAction } from '../../types/index.js';
import {
  LOG_AGENDA_ADOPTED,
  LOG_AGENDA_OBJECTION,
  logAgendaItemCalled,
  logAgendaItemCompleted,
} from '../../constants/logMessages.js';
import type { ActionHandler } from './types.js';

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
      const newAgenda = [...state.agenda];
      const [moved] = newAgenda.splice(typedAction.fromIndex, 1);
      newAgenda.splice(typedAction.toIndex, 0, moved);
      return { ...state, agenda: newAgenda };
    }

    case 'ADOPT_AGENDA': {
      const typedAction = action as Extract<MeetingAction, { type: 'ADOPT_AGENDA' }>;
      return {
        ...state,
        agendaAdopted: true,
        agendaObjection: false,
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
        currentAgendaItem: item || null,
        agenda: updatedAgenda,
        meetingLog: log(typedAction.timestamp, logAgendaItemCalled(item?.title)),
      };
    }

    case 'COMPLETE_AGENDA_ITEM': {
      const typedAction = action as Extract<MeetingAction, { type: 'COMPLETE_AGENDA_ITEM' }>;
      const updatedAgenda = state.agenda.map((a) =>
        a.id === typedAction.id ? { ...a, status: 'completed' as const } : a,
      );
      return {
        ...state,
        currentAgendaItem: null,
        agenda: updatedAgenda,
        meetingLog: log(
          typedAction.timestamp,
          logAgendaItemCompleted(state.currentAgendaItem?.title),
        ),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
