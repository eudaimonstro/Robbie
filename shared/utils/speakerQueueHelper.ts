import type { MeetingState, SpeakerQueueEntry } from '../types/index.js';
import { isRuleSuspended } from './ruleSuspensionHelper.js';

export interface StanceBalance {
  pro: number;
  con: number;
  neutral: number;
  isBalanced: boolean; // True if difference between pro and con is <= 1
}

/**
 * The speaker queue in the order the chair will call it, following Robert's Rules:
 * 1. The mover, if they haven't spoken yet on the current motion
 * 2. Alternating for and against: after a speaker for, those against come first, and the
 *    reverse (unless 'pro-con-alternation' is suspended)
 * 3. Otherwise the order hands went up
 */
export function sortSpeakerQueue(state: MeetingState): SpeakerQueueEntry[] {
  const { speakerQueue, currentMotion, lastSpeakerStance } = state;
  const alternationSuspended = isRuleSuspended(state, 'pro-con-alternation');
  const motionMakerId = currentMotion?.moverId;
  const moverHasSpoken = currentMotion?.moverHasSpoken;

  return [...speakerQueue].sort((a, b) => {
    const aIsMover = motionMakerId && a.member.id === motionMakerId && !moverHasSpoken;
    const bIsMover = motionMakerId && b.member.id === motionMakerId && !moverHasSpoken;

    if (aIsMover && !bIsMover) return -1;
    if (!aIsMover && bIsMover) return 1;

    if (!alternationSuspended && lastSpeakerStance && lastSpeakerStance !== 'neutral') {
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

/**
 * Calculate the balance of stances in the speaker queue
 */
export function calculateStanceBalance(queue: SpeakerQueueEntry[]): StanceBalance {
  const pro = queue.filter((e) => e.stance === 'pro').length;
  const con = queue.filter((e) => e.stance === 'con').length;
  const neutral = queue.filter((e) => e.stance === 'neutral').length;

  return {
    pro,
    con,
    neutral,
    isBalanced: Math.abs(pro - con) <= 1,
  };
}

/**
 * Check if a member can remove themselves from the queue
 */
export function canRemoveSelfFromQueue(state: MeetingState, memberId: number): boolean {
  // Can only remove yourself if you're in the queue
  const isInQueue = state.speakerQueue.some((e) => e.member.id === memberId);

  // Cannot remove yourself if you're the currently recognized speaker
  const isCurrentSpeaker = state.recognizedSpeaker?.id === memberId;

  return isInQueue && !isCurrentSpeaker;
}

/**
 * Format seconds into human-readable wait time
 */
export function formatWaitTime(seconds: number): string {
  if (seconds <= 0) return 'Now';
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes}min`;
  }
  return `${minutes}min ${remainingSeconds}s`;
}
