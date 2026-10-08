import type { MeetingState, SpeakerQueueEntry, DebateStance } from '../types/index.js';
import { isRuleSuspended } from './ruleSuspensionHelper.js';

export interface SpeakerQueueInfo {
  position: number; // 1-indexed position in queue
  estimatedWaitSeconds: number;
  willSpeakNext: boolean;
  stanceBalance: StanceBalance;
}

export interface StanceBalance {
  pro: number;
  con: number;
  neutral: number;
  isBalanced: boolean; // True if difference between pro and con is <= 1
}

export interface QueueStats {
  totalInQueue: number;
  stanceBalance: StanceBalance;
  estimatedTotalTime: number;
  currentSpeakerRemaining: number | null;
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
 * Get information about a specific member's position in the speaker queue
 */
export function getMemberQueueInfo(state: MeetingState, memberId: number): SpeakerQueueInfo | null {
  const queueIndex = state.speakerQueue.findIndex((entry) => entry.member.id === memberId);

  if (queueIndex === -1) {
    return null; // Member not in queue
  }

  const position = queueIndex + 1;
  const speakerTimeLimit = state.speakerTimeLimit;

  // Calculate estimated wait time
  // Account for current speaker's remaining time
  let waitSeconds = 0;

  if (state.recognizedSpeaker && state.speakerTimerEnd) {
    const remainingMs = state.speakerTimerEnd - Date.now();
    waitSeconds += Math.max(0, Math.ceil(remainingMs / 1000));
  }

  // Add time for speakers ahead in queue
  waitSeconds += queueIndex * speakerTimeLimit;

  // Check if this member will speak next
  const willSpeakNext = position === 1 && !state.recognizedSpeaker;

  return {
    position,
    estimatedWaitSeconds: waitSeconds,
    willSpeakNext,
    stanceBalance: calculateStanceBalance(state.speakerQueue),
  };
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
 * Get overall queue statistics
 */
export function getQueueStats(state: MeetingState): QueueStats {
  const stanceBalance = calculateStanceBalance(state.speakerQueue);
  const speakerTimeLimit = state.speakerTimeLimit;

  // Calculate current speaker's remaining time
  let currentSpeakerRemaining: number | null = null;
  if (state.recognizedSpeaker && state.speakerTimerEnd) {
    const remainingMs = state.speakerTimerEnd - Date.now();
    currentSpeakerRemaining = Math.max(0, Math.ceil(remainingMs / 1000));
  }

  // Estimate total time for all speakers in queue
  const estimatedTotalTime =
    state.speakerQueue.length * speakerTimeLimit + (currentSpeakerRemaining ?? 0);

  return {
    totalInQueue: state.speakerQueue.length,
    stanceBalance,
    estimatedTotalTime,
    currentSpeakerRemaining,
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

/**
 * Determine the next speaker based on pro/con alternation rule
 */
export function getNextSpeakerInfo(state: MeetingState): {
  nextSpeaker: SpeakerQueueEntry | null;
  isAlternating: boolean;
  preferredStance: DebateStance | null;
} {
  if (state.speakerQueue.length === 0) {
    return { nextSpeaker: null, isAlternating: false, preferredStance: null };
  }

  // Check if alternation rule is active
  const isAlternating = !state.suspendedRules.some((r) => r.rule === 'pro-con-alternation');

  if (!isAlternating) {
    // No alternation - first in queue speaks next
    return {
      nextSpeaker: state.speakerQueue[0],
      isAlternating: false,
      preferredStance: null,
    };
  }

  // Determine preferred stance based on last speaker
  let preferredStance: DebateStance | null = null;
  if (state.lastSpeakerStance === 'pro') {
    preferredStance = 'con';
  } else if (state.lastSpeakerStance === 'con') {
    preferredStance = 'pro';
  }

  // Find the first speaker matching preferred stance, or fall back to first in queue
  let nextSpeaker = state.speakerQueue[0];
  if (preferredStance) {
    const preferredSpeaker = state.speakerQueue.find((e) => e.stance === preferredStance);
    if (preferredSpeaker) {
      nextSpeaker = preferredSpeaker;
    }
  }

  return { nextSpeaker, isAlternating, preferredStance };
}
