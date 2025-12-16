import { useMemo } from 'react';
import type { Member, Motion } from '../types';

/**
 * Custom hook to sort speaker queue with priority for motion maker
 * @param speakerQueue - Array of members in the speaker queue
 * @param currentMotion - Current motion being discussed (if any)
 * @returns Sorted speaker queue with motion maker first (if they haven't spoken)
 */
export function useSortedSpeakerQueue(speakerQueue: Member[], currentMotion: Motion | null) {
  return useMemo(() => {
    // Prioritize motion maker if they haven't spoken yet
    const motionMakerId = currentMotion?.moverId;
    const moverHasSpoken = currentMotion?.moverHasSpoken;

    return [...speakerQueue].sort((a, b) => {
      const aIsMover = motionMakerId && a.id === motionMakerId && !moverHasSpoken;
      const bIsMover = motionMakerId && b.id === motionMakerId && !moverHasSpoken;
      if (aIsMover && !bIsMover) return -1;
      if (!aIsMover && bIsMover) return 1;
      return 0;
    });
  }, [speakerQueue, currentMotion]);
}
