import type {
  CompletedMotion,
  Votes,
  VoteRequirement,
  VoteCalculationResult,
} from '../types/index.js';

export const NO_VOTES: Votes = { yea: 0, nay: 0, abstain: 0 };

/** Two counts added together: device votes and the floor tally, say */
export function addVotes(a: Votes, b: Votes = NO_VOTES): Votes {
  return { yea: a.yea + b.yea, nay: a.nay + b.nay, abstain: a.abstain + b.abstain };
}

/**
 * A decided motion's vote, device and floor votes together. Records made before the parts
 * were kept are counted from their device votes.
 */
export function completedMotionVotes(motion: CompletedMotion): Votes {
  if (motion.deviceVotes) return addVotes(motion.deviceVotes, motion.floorVotes);
  const counts = { ...NO_VOTES };
  for (const vote of Object.values(motion.voterChoices)) counts[vote]++;
  return counts;
}

/**
 * Calculate whether a vote passes based on the vote requirement
 * @param votes - The vote counts
 * @param requirement - The vote requirement ('majority', '2/3', or 'none')
 * @returns Calculation result with pass/fail and vote details
 */
export function calculateVoteResult(
  votes: Votes,
  requirement: VoteRequirement,
): VoteCalculationResult {
  const { yea, nay, abstain } = votes;
  const total = yea + nay; // Abstentions don't count toward total per Robert's Rules

  // Calculate threshold based on requirement
  const threshold = requirement === '2/3' ? total * (2 / 3) : total / 2;

  // RONR: a majority is more than half of the votes cast; two-thirds is at least
  // two-thirds of the votes cast. Integer comparisons avoid floating-point edge cases.
  const passed = requirement === '2/3' ? total > 0 && yea * 3 >= total * 2 : yea * 2 > total;

  return {
    passed,
    yea,
    nay,
    abstain,
    total,
    threshold,
    requirement,
  };
}

/**
 * RONR: the chair votes (outside a ballot) only when the chair's vote would change the result,
 * for example to break or make a tie, or to reach or block two-thirds. That is judged on the
 * votes already cast, so it is never true before anyone has voted.
 * @param votes - Current vote counts (device votes and the floor tally together), without the
 *   chair's vote
 * @param requirement - The vote requirement of the pending question
 */
export function canChairVoteDecide(votes: Votes, requirement: VoteRequirement): boolean {
  if (votes.yea + votes.nay === 0) return false;
  const passes = (v: Votes) => calculateVoteResult(v, requirement).passed;
  const now = passes(votes);
  return (
    passes({ ...votes, yea: votes.yea + 1 }) !== now ||
    passes({ ...votes, nay: votes.nay + 1 }) !== now
  );
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
    canCreateTie: yeaAheadByOne,
  };
}
