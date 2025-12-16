import type { MeetingState, AgendaItem } from '../types';

/**
 * Helper function to handle motion outcome logic
 * Used by both CLOSE_VOTING and UNANIMOUS_CONSENT_PASSED
 */
export function applyMotionOutcome(state: MeetingState): {
  tabledMotions: typeof state.tabledMotions;
  agendaAdopted: boolean;
  agendaObjection: boolean;
  agenda: AgendaItem[];
} {
  const newStack = state.motionStack.slice(0, -1);
  let tabledMotions = state.tabledMotions;
  let agendaAdopted = state.agendaAdopted;
  let agendaObjection = state.agendaObjection;
  let agenda = state.agenda;

  // Handle table motion
  if (state.currentMotion?.type === 'layOnTable') {
    const mainMotion = newStack.find(m => m.category === 'main');
    if (mainMotion) {
      tabledMotions = [...tabledMotions, mainMotion];
    }
  }

  // Handle agenda adoption
  if (state.currentMotion?.isAgendaAdoption) {
    agendaAdopted = true;
    agendaObjection = false;
  }

  // Handle agenda amendments
  if (state.currentMotion?.agendaAmendment) {
    const amendment = state.currentMotion.agendaAmendment;

    if (amendment.action === 'add' && amendment.title) {
      const newItem: AgendaItem = {
        id: amendment.itemId || 0,
        title: amendment.title,
        status: "pending" as const
      };

      if (amendment.position === 'end') {
        agenda = [...agenda, newItem];
      } else if (amendment.position === 'beginning') {
        agenda = [newItem, ...agenda];
      } else if (typeof amendment.position === 'number') {
        agenda = [
          ...agenda.slice(0, amendment.position),
          newItem,
          ...agenda.slice(amendment.position)
        ];
      }
    } else if (amendment.action === 'remove') {
      agenda = agenda.filter(item => item.id !== amendment.itemId);
    } else if (amendment.action === 'reorder') {
      const newAgenda = [...agenda];
      const [moved] = newAgenda.splice(amendment.fromIndex, 1);
      newAgenda.splice(amendment.toIndex, 0, moved);
      agenda = newAgenda;
    }
  }

  return { tabledMotions, agendaAdopted, agendaObjection, agenda };
}
