import { MOTIONS } from '../constants/motions.js';
import { motionOutOfOrder, OFFERED_MOTIONS } from './motionRules.js';
import type { BylawAmendment, MeetingState, MotionDefinition } from '../types/index.js';

export interface ValidMotion extends MotionDefinition {
  key: string;
}

/**
 * Whether the mover has claimed the first chance to speak on their motion (RONR 42:9): they are
 * waiting to speak and haven't yet. The chair recognizes them first then; a mover who doesn't
 * ask to speak claims nothing, and the chair recognizes whoever is waiting.
 */
export function moverClaimsFloor(state: MeetingState): boolean {
  const motion = state.currentMotion;
  if (!motion || !motion.debatable || motion.moverHasSpoken || !motion.moverId) return false;
  return state.speakerQueue.some((entry) => entry.member.id === motion.moverId);
}

/**
 * Whether someone may ask for the floor now: in session, nothing being voted on, and either
 * nothing pending (an open forum, a report's questions) or a debatable question whose debate is
 * open. Members may change sides as they please (RONR doesn't forbid it).
 */
export function floorOpenForDebate(state: MeetingState): boolean {
  if (!state.meetingActive || state.recess || state.adjournmentCarried) return false;
  if (state.votingOpen || state.currentElection?.votingInProgress) return false;
  const motion = state.currentMotion;
  if (!motion) return !state.pendingSecond;
  return motion.debatable && !motion.debateClosed && motion.vote !== 'none';
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
 * The motions in order now, of those Robbie offers (motionOutOfOrder says why the others are
 * not), in the order a phone lists them. A motion of the agenda's defeated this meeting isn't
 * offered again; a main motion or a bylaw amendment is refused by the server only when it renews
 * a defeated one's subject or change.
 */
export function getValidMotions(state: MeetingState): ValidMotion[] {
  return OFFERED_MOTIONS.filter((key) => motionOutOfOrder(state, key) === null)
    .filter(
      (key) =>
        MOTIONS[key].category !== 'main' ||
        key === 'mainMotion' ||
        key === 'bylawAmendment' ||
        !wasMotionDefeated(state, key),
    )
    .map((key) => ({ key, ...MOTIONS[key] }));
}
