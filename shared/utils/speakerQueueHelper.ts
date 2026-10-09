import type { MeetingState, SpeakerQueueEntry } from '../types/index.js';

/**
 * The speaker queue in the order the chair will call it, following Robert's Rules:
 * 1. The mover, if they haven't spoken yet on the current motion
 * 2. Alternating for and against: after a speaker for, those against come first, and the
 *    reverse
 * 3. Otherwise the order hands went up
 */
export function sortSpeakerQueue(state: MeetingState): SpeakerQueueEntry[] {
  const { speakerQueue, currentMotion, lastSpeakerStance } = state;
  const motionMakerId = currentMotion?.moverId;
  const moverHasSpoken = currentMotion?.moverHasSpoken;

  return [...speakerQueue].sort((a, b) => {
    const aIsMover = motionMakerId && a.member.id === motionMakerId && !moverHasSpoken;
    const bIsMover = motionMakerId && b.member.id === motionMakerId && !moverHasSpoken;

    if (aIsMover && !bIsMover) return -1;
    if (!aIsMover && bIsMover) return 1;

    if (lastSpeakerStance && lastSpeakerStance !== 'neutral') {
      const aIsOpposite =
        (lastSpeakerStance === 'pro' && a.stance === 'con') ||
        (lastSpeakerStance === 'con' && a.stance === 'pro');
      const bIsOpposite =
        (lastSpeakerStance === 'pro' && b.stance === 'con') ||
        (lastSpeakerStance === 'con' && b.stance === 'pro');

      if (aIsOpposite && !bIsOpposite) return -1;
      if (!aIsOpposite && bIsOpposite) return 1;
    }

    return 0;
  });
}
