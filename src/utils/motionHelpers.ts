import { MOTIONS } from '../constants/motions';
import { isRuleSuspended } from './ruleSuspensionHelper';
import type { MeetingState } from '../types';

export function getValidMotions(state: MeetingState, currentUserId?: number) {
  const currentPrecedence = state.currentMotion?.precedence || 0;
  const hasAmendment = state.motionStack.some(m => m.type === 'amend');
  const hasSecondaryAmendment = state.motionStack.some(m => m.type === 'amendAmendment');
  const isAgendaAdoptionPending = state.currentMotion?.type === 'adoptAgenda';
  const validMotions = [];

  // Check if motion precedence is suspended
  const precedenceSuspended = isRuleSuspended(state, 'motion-precedence');
  // Check if amendment depth limit is suspended
  const amendmentDepthSuspended = isRuleSuspended(state, 'amendment-depth');

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
    // Amendment depth enforcement (unless suspended)
    if (!amendmentDepthSuspended && key === 'amendAmendment' && (!hasAmendment || hasSecondaryAmendment)) return;
    if (!amendmentDepthSuspended && key === 'amend' && state.currentMotion?.type === 'amendAmendment') return;
    // Renewal rule: Cannot renew defeated main motions at same meeting
    if (motion.category === 'main' && wasDefeated(key)) return;
    // Appeal: Only available immediately after a chair ruling
    if (key === 'appeal' && !state.lastChairRuling) return;
    // Objection to Consideration: Only for main motions before debate begins
    if (key === 'objectionConsideration') {
      const hasMainMotion = state.currentMotion?.category === 'main';
      const debateStarted = state.currentMotion?.moverHasSpoken || state.recognizedSpeaker !== null;
      const isActive = state.currentMotion?.status === 'active';
      if (!hasMainMotion || debateStarted || !isActive) return;
    }
    // Reconsider: Only available to voters on prevailing side
    if (key === 'reconsider') {
      if (!currentUserId) return; // Need user ID to check eligibility
      const hasReconsiderableMotions = state.completedMotions.some(cm => {
        if (cm.reconsidered) return false; // Already reconsidered
        const userVote = cm.voterChoices[currentUserId];
        if (!userVote || userVote === 'abstain') return false; // Didn't vote or abstained
        // Prevailing side: if motion passed, yea voters can reconsider; if failed, nay voters can
        const onPrevailingSide = cm.passed ? (userVote === 'yea') : (userVote === 'nay');
        return onPrevailingSide;
      });
      if (!hasReconsiderableMotions) return;
    }

    // Motion availability rules per Robert's Rules:
    // - Incidental: Always in order (no fixed precedence)
    // - Subsidiary: Only when there's a motion to apply them to (currentPrecedence >= 1)
    // - Privileged: Always available when precedence is higher than current
    // - Main: Already filtered above (line 27)
    // - When motion-precedence suspended: Allow all motions regardless of precedence

    if (motion.category === 'incidental') {
      validMotions.push({ key, ...motion });
    } else if (motion.category === 'subsidiary' && currentPrecedence >= 1) {
      // Allow if precedence suspended OR precedence is higher
      if (precedenceSuspended || motion.precedence > currentPrecedence) {
        validMotions.push({ key, ...motion });
      }
    } else if (motion.category === 'privileged') {
      // Allow if precedence suspended OR precedence is higher
      if (precedenceSuspended || motion.precedence > currentPrecedence) {
        validMotions.push({ key, ...motion });
      }
    }
  });
  return validMotions;
}
