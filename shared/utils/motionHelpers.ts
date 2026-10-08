import { MOTIONS } from '../constants/motions.js';
import { motionOutOfOrder, OFFERED_MOTIONS } from './motionRules.js';
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

/** Why a bylaw amendment's words can't be changed in the meeting */
export const BYLAW_WORDING_FIXED =
  "A bylaw amendment's words come from its text: withdraw it and move it again";

/**
 * Whether this motion would change a pending bylaw amendment's words: amending it, or amending
 * an amendment of it. Its words are the text the room sees and the sync applies.
 */
export function wordingFixedBy(state: MeetingState, motionType: string): boolean {
  const current = state.currentMotion;
  if (!current) return false;
  if (motionType === 'amend' || motionType === 'divideQuestion') {
    return current.type === 'bylawAmendment';
  }
  if (motionType === 'amendAmendment') {
    const amended = state.motionStack[state.motionStack.length - 2];
    return current.type === 'amend' && amended?.type === 'bylawAmendment';
  }
  return false;
}

/**
 * The motions in order now, of those Robbie offers (motionOutOfOrder says why the others are
 * not), in the order a phone lists them. A motion of the agenda's defeated this meeting isn't
 * offered again; a main motion or a bylaw amendment is refused by the server only when it renews
 * a defeated one's subject or change.
 *
 * @param _currentUserId - kept for the mobile app, which passes it
 */
export function getValidMotions(state: MeetingState, _currentUserId?: number): ValidMotion[] {
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
