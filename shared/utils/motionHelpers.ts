import { MOTIONS } from '../constants/motions.js';
import { isRuleSuspended } from './ruleSuspensionHelper.js';
import type {
  BylawAmendment,
  MeetingState,
  Member,
  Motion,
  MotionDefinition,
} from '../types/index.js';

export interface ValidMotion extends MotionDefinition {
  key: string;
}

/**
 * Whether the mover of a motion can claim the first chance to speak on it (RONR), which the
 * chair keeps for them until they have spoken. Only someone on a device can ask for the floor,
 * so a question put by the chair, a motion moved from the floor by a typed name or by a member
 * in the room without a device, gives no one that claim.
 */
export function moverCanClaimFloor(motion: Motion, members: readonly Member[]): boolean {
  if (!motion.moverId) return false;
  if (!motion.fromFloor) return true;
  const mover = members.find((m) => m.id === motion.moverId);
  return !!mover && mover.present && mover.presentBy !== 'chair';
}

/**
 * Normalize text for comparison (case-insensitive, trimmed, collapse whitespace)
 */
export function normalizeMotionText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Check if two motion texts are substantially similar (same subject matter)
 */
export function isSimilarMotionSubject(text1: string, text2: string): boolean {
  const norm1 = normalizeMotionText(text1);
  const norm2 = normalizeMotionText(text2);
  // Exact match after normalization
  if (norm1 === norm2) return true;
  // Check if one contains the other (substring match for similar subject)
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
  // Check for significant word overlap (>50% of words in common)
  const words1 = new Set(norm1.split(' ').filter((w) => w.length > 3)); // Skip short words
  const words2 = new Set(norm2.split(' ').filter((w) => w.length > 3));
  if (words1.size === 0 || words2.size === 0) return false;
  const commonWords = [...words1].filter((w) => words2.has(w)).length;
  const overlapRatio = commonWords / Math.min(words1.size, words2.size);
  return overlapRatio >= 0.5;
}

/**
 * Check if two bylaw amendments propose the same change: the same edit to the same part of the
 * same document, with the same wording apart from case and spacing
 */
function isSameBylawChange(a: BylawAmendment, b: BylawAmendment): boolean {
  const norm = (text?: string) => normalizeMotionText(text ?? '');
  return (
    a.documentId === b.documentId &&
    a.changeType === b.changeType &&
    a.targetSectionId === b.targetSectionId &&
    a.parentSectionId === b.parentSectionId &&
    norm(a.newContent) === norm(b.newContent) &&
    norm(a.newTitle) === norm(b.newTitle) &&
    norm(a.newNumberLabel) === norm(b.newNumberLabel)
  );
}

/**
 * Check if a motion with given type and text was defeated this meeting
 */
export function wasMotionDefeated(
  state: MeetingState,
  motionType: string,
  motionText?: string,
  bylawAmendment?: BylawAmendment,
): boolean {
  if (!state.defeatedMotions?.length) return false;
  // A bylaw amendment's text is generated from the section label, so compare the change itself
  if (motionType === 'bylawAmendment' && bylawAmendment) {
    return state.defeatedMotions.some(
      (dm) =>
        dm.type === motionType &&
        dm.bylawAmendment !== undefined &&
        isSameBylawChange(dm.bylawAmendment, bylawAmendment),
    );
  }
  // For main motions, check subject matter; for others, just check type
  if (motionType === 'mainMotion' && motionText) {
    return state.defeatedMotions.some(
      (dm) => dm.type === motionType && isSimilarMotionSubject(dm.text, motionText),
    );
  }
  return state.defeatedMotions.some((dm) => dm.type === motionType);
}

/**
 * Get all motions that are currently valid/in-order based on meeting state
 *
 * Applies Robert's Rules precedence and availability logic:
 * - Main motions only when no other motion is pending
 * - Subsidiary motions only when there's a motion to apply them to
 * - Privileged motions always available when precedence allows
 * - Incidental motions always in order
 *
 * Also enforces:
 * - Amendment depth limits (primary and secondary only)
 * - Renewal prohibitions (defeated motions can't be renewed same session)
 * - Special rules (appeal only after chair ruling, objection before debate, etc.)
 * - Rule suspension overrides when applicable
 *
 * @param state - Current meeting state
 * @param currentUserId - Optional user ID for checking reconsider eligibility
 * @returns Array of valid motions with their definitions
 */
/**
 * A secondary amendment (amend the amendment) applies only to a primary amendment, and is in
 * order only while that amendment is the immediately pending question (RONR §12). Its numeric
 * precedence can't express this, so it is checked by type. With the amendment-depth rule
 * suspended, a secondary amendment may itself be amended.
 */
export function isSecondaryAmendmentInOrder(state: MeetingState): boolean {
  const pending = state.currentMotion?.type;
  return (
    pending === 'amend' ||
    (pending === 'amendAmendment' && isRuleSuspended(state, 'amendment-depth'))
  );
}

export function getValidMotions(state: MeetingState, currentUserId?: number): ValidMotion[] {
  const currentPrecedence = state.currentMotion?.precedence || 0;
  const hasAmendment = state.motionStack.some((m) => m.type === 'amend');
  const hasSecondaryAmendment = state.motionStack.some((m) => m.type === 'amendAmendment');
  const isAgendaAdoptionPending = state.currentMotion?.type === 'adoptAgenda';
  const validMotions: ValidMotion[] = [];

  // Check if motion precedence is suspended
  const precedenceSuspended = isRuleSuspended(state, 'motion-precedence');
  // Check if amendment depth limit is suspended
  const amendmentDepthSuspended = isRuleSuspended(state, 'amendment-depth');

  // Use the exported wasMotionDefeated for checking defeated motions
  const wasDefeated = (motionType: string) => wasMotionDefeated(state, motionType);

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
    if (
      !amendmentDepthSuspended &&
      key === 'amendAmendment' &&
      (!hasAmendment || hasSecondaryAmendment)
    )
      return;
    if (
      !amendmentDepthSuspended &&
      key === 'amend' &&
      state.currentMotion?.type === 'amendAmendment'
    )
      return;
    // Renewal rule: For other main motions (like adoptAgenda, takeFromTable), block if that
    // specific type was defeated. Main motions and bylaw amendments stay available; the
    // validator blocks only one that renews a defeated motion's subject or change.
    if (
      motion.category === 'main' &&
      key !== 'mainMotion' &&
      key !== 'bylawAmendment' &&
      wasDefeated(key)
    )
      return;
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
      const hasReconsiderableMotions = state.completedMotions.some((cm) => {
        if (cm.reconsidered) return false; // Already reconsidered
        if (cm.reconsiderable === false) return false; // Its motion can't be reconsidered
        const userVote = cm.voterChoices[currentUserId];
        if (!userVote || userVote === 'abstain') return false; // Didn't vote or abstained
        // Prevailing side: if motion passed, yea voters can reconsider; if failed, nay voters can
        const onPrevailingSide = cm.passed ? userVote === 'yea' : userVote === 'nay';
        return onPrevailingSide;
      });
      if (!hasReconsiderableMotions) return;
    }

    // Motion availability rules per Robert's Rules:
    // - Incidental: Always in order (no fixed precedence)
    // - Subsidiary: Only when there's a motion to apply them to (currentPrecedence >= 1)
    // - Privileged: Always available when precedence is higher than current
    // - Main: Only when nothing is pending (new business), except reconsider, which may
    //   interrupt; adoptAgenda is offered by the agenda block above
    // - When motion-precedence suspended: Allow all motions regardless of precedence

    if (motion.category === 'incidental') {
      validMotions.push({ key, ...motion });
    } else if (key === 'amendAmendment') {
      if (isSecondaryAmendmentInOrder(state)) {
        validMotions.push({ key, ...motion });
      }
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
    } else if (motion.category === 'main') {
      if (key === 'adoptAgenda') return;
      // Eligibility was checked above, and reconsider may be made while other business is pending
      if (key === 'reconsider') {
        validMotions.push({ key, ...motion });
        return;
      }
      // New business waits until no motion is pending and any agenda objection is resolved
      if (state.currentMotion || (state.agendaObjection && !state.agendaAdopted)) return;
      if (key === 'takeFromTable' && state.tabledMotions.length === 0) return;
      validMotions.push({ key, ...motion });
    }
  });
  return validMotions;
}
