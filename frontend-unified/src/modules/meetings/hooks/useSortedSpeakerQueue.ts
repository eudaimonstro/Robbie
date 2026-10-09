import { useMemo } from 'react';
import type {
  SpeakerQueueEntry,
  Motion,
  DebateStance,
  MeetingState,
} from '@robbie-bylawyer/shared/types';
import { sortSpeakerQueue } from '@robbie-bylawyer/shared/utils';

/**
 * The speaker queue in the order the chair will call it (`sortSpeakerQueue` in shared): the
 * mover first if they haven't spoken, then alternating for and
 * against in turn, then the order hands went up.
 *
 * @example
 * ```tsx
 * const sortedQueue = useSortedSpeakerQueue(
 *   state.speakerQueue,
 *   state.currentMotion,
 *   state.lastSpeakerStance,
 *   state
 * );
 * ```
 */
export function useSortedSpeakerQueue(
  speakerQueue: SpeakerQueueEntry[],
  currentMotion: Motion | null,
  lastSpeakerStance: DebateStance | null,
  state: MeetingState,
) {
  return useMemo(
    () => sortSpeakerQueue({ ...state, speakerQueue, currentMotion, lastSpeakerStance }),
    [speakerQueue, currentMotion, lastSpeakerStance, state],
  );
}
