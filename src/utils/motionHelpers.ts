import { MOTIONS } from '../constants/motions';

export function getValidMotions(state) {
  const currentPrecedence = state.currentMotion?.precedence || 0;
  const hasAmendment = state.motionStack.some(m => m.type === 'amend');
  const hasSecondaryAmendment = state.motionStack.some(m => m.type === 'amendAmendment');
  const isAgendaAdoptionPending = state.currentMotion?.type === 'adoptAgenda';
  const validMotions = [];

  // Helper to check if a motion was defeated this meeting
  const wasDefeated = (motionType: string) => {
    return state.defeatedMotions?.some(dm => dm.type === motionType) || false;
  };

  // When agenda objection exists and no current motion, prioritize agenda motions
  // but don't block privileged motions (they're always in order)
  if (!state.agendaAdopted && state.agendaObjection && !state.currentMotion) {
    validMotions.push({ key: 'adoptAgenda', ...MOTIONS.adoptAgenda });
    validMotions.push({ key: 'amendAgenda', ...MOTIONS.amendAgenda });
  }
  if (isAgendaAdoptionPending) {
    validMotions.push({ key: 'amendAgenda', ...MOTIONS.amendAgenda });
  }
  Object.entries(MOTIONS).forEach(([key, motion]) => {
    if ((key === 'adoptAgenda' || key === 'amendAgenda') && state.agendaAdopted) return;
    if (key === 'adoptAgenda' && isAgendaAdoptionPending) return;
    if (key === 'mainMotion' && currentPrecedence > 0) return;
    if (key === 'amendAmendment' && (!hasAmendment || hasSecondaryAmendment)) return;
    if (key === 'amend' && state.currentMotion?.type === 'amendAmendment') return;
    // Renewal rule: Cannot renew defeated main motions at same meeting
    if (motion.category === 'main' && wasDefeated(key)) return;
    if (motion.category === 'incidental' || motion.precedence > currentPrecedence) {
      validMotions.push({ key, ...motion });
    }
  });
  return validMotions;
}
