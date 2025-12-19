import type { Votes } from '../types';

export type VoteRequirement = 'majority' | '2/3' | 'none';

export interface VoteCalculationResult {
  passed: boolean;
  yea: number;
  nay: number;
  abstain: number;
  total: number;
  threshold: number;
}

/**
 * Calculate whether a vote passes based on the vote requirement
 * @param votes - The vote counts
 * @param requirement - The vote requirement ('majority', '2/3', or 'none')
 * @returns Calculation result with pass/fail and vote details
 */
export function calculateVoteResult(
  votes: Votes,
  requirement: VoteRequirement
): VoteCalculationResult {
  const { yea, nay, abstain } = votes;
  const total = yea + nay; // Abstentions don't count toward total per Robert's Rules

  // Calculate threshold based on requirement
  const threshold = requirement === '2/3'
    ? total * (2 / 3)
    : total / 2;

  // Motion passes if yea exceeds threshold (strict majority)
  const passed = yea > threshold;

  return {
    passed,
    yea,
    nay,
    abstain,
    total,
    threshold
  };
}

/**
 * Check if chair can cast a deciding vote
 * @param votes - Current vote counts
 * @returns Object indicating if chair can break or create a tie
 */
export function getChairVotingOptions(votes: Votes): {
  canBreakTie: boolean;
  canCreateTie: boolean;
} {
  const { yea, nay } = votes;
  const isTied = yea === nay;
  const yeaAheadByOne = yea === nay + 1;

  return {
    canBreakTie: isTied,
    canCreateTie: yeaAheadByOne
  };
}
