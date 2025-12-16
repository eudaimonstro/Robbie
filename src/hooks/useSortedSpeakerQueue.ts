import { useMemo } from 'react';
import type { SpeakerQueueEntry, Motion, DebateStance } from '../types';

/**
 * Custom hook to sort speaker queue with priority for:
 * 1. Motion maker (if they haven't spoken)
 * 2. Alternating between pro/con speakers per Robert's Rules
 * @param speakerQueue - Array of speaker queue entries with members and stances
 * @param currentMotion - Current motion being discussed (if any)
 * @param lastSpeakerStance - Stance of the last recognized speaker
 * @returns Sorted speaker queue following parliamentary debate rules
 */
export function useSortedSpeakerQueue(
  speakerQueue: SpeakerQueueEntry[],
  currentMotion: Motion | null,
  lastSpeakerStance: DebateStance | null
) {
  return useMemo(() => {
    // Prioritize motion maker if they haven't spoken yet
    const motionMakerId = currentMotion?.moverId;
    const moverHasSpoken = currentMotion?.moverHasSpoken;

    return [...speakerQueue].sort((a, b) => {
      const aIsMover = motionMakerId && a.member.id === motionMakerId && !moverHasSpoken;
      const bIsMover = motionMakerId && b.member.id === motionMakerId && !moverHasSpoken;

      // Motion maker always goes first if they haven't spoken
      if (aIsMover && !bIsMover) return -1;
      if (!aIsMover && bIsMover) return 1;

      // Alternate between pro/con speakers per Robert's Rules
      // If last speaker was pro, prioritize con speakers; if con, prioritize pro
      if (lastSpeakerStance && lastSpeakerStance !== 'neutral') {
        const aIsOpposite = (lastSpeakerStance === 'pro' && a.stance === 'con') ||
                           (lastSpeakerStance === 'con' && a.stance === 'pro');
        const bIsOpposite = (lastSpeakerStance === 'pro' && b.stance === 'con') ||
                           (lastSpeakerStance === 'con' && b.stance === 'pro');

        if (aIsOpposite && !bIsOpposite) return -1;
        if (!aIsOpposite && bIsOpposite) return 1;
      }

      // Otherwise maintain queue order
      return 0;
    });
  }, [speakerQueue, currentMotion, lastSpeakerStance]);
}
