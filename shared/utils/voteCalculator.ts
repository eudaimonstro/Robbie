import type {
  BylawAmendment,
  BylawAmendmentVote,
  CompletedMotion,
  Votes,
  VoteRequirement,
  VoteCalculationResult,
  VoteThreshold,
} from '../types/index.js';
import { MOTIONS } from '../constants/motions.js';

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

/** A requirement as a threshold of the votes cast ("none" is a majority, as it always was) */
function asThreshold(requirement: VoteRequirement | VoteThreshold): VoteThreshold {
  if (typeof requirement === 'object') return requirement;
  return { fraction: requirement === '2/3' ? '2/3' : 'majority', of: 'cast' };
}

/**
 * The yes votes a threshold of all the voting members needs (RONR 44:9): more than half of them
 * for a majority (72 of 142), at least two thirds for two thirds (95 of 142), and never fewer
 * than one. Null for a threshold of the votes cast, which depends on the votes.
 */
export function votesNeeded(threshold: VoteThreshold): number | null {
  if (threshold.of !== 'members') return null;
  const members = Math.max(0, Math.floor(threshold.members ?? 0));
  const needed =
    threshold.fraction === '2/3' ? Math.ceil((members * 2) / 3) : Math.floor(members / 2) + 1;
  return Math.max(1, needed);
}

/** Whether the yes votes reach the fraction of the votes cast (abstentions left out) */
function carriesAmongCast(yea: number, nay: number, fraction: VoteThreshold['fraction']): boolean {
  const total = yea + nay;
  // RONR: a majority is more than half of the votes cast; two thirds is at least two thirds of
  // them. Integer comparisons avoid floating-point edge cases.
  return fraction === '2/3' ? total > 0 && yea * 3 >= total * 2 : yea * 2 > total;
}

/**
 * Calculate whether a vote passes based on the vote requirement
 * @param votes - The vote counts
 * @param requirement - 'majority', '2/3' or 'none' of the votes cast, or a threshold, which may
 *   be of all the voting members: then the yes votes must reach the number needed (an abstention
 *   helps no more than a no) and carry among the votes cast too
 * @returns Calculation result with pass/fail and vote details
 */
export function calculateVoteResult(
  votes: Votes,
  requirement: VoteRequirement | VoteThreshold,
): VoteCalculationResult {
  const { yea, nay, abstain } = votes;
  const total = yea + nay; // Abstentions don't count toward total per Robert's Rules
  const threshold = asThreshold(requirement);
  const needed = votesNeeded(threshold);
  const passed =
    carriesAmongCast(yea, nay, threshold.fraction) && (needed === null || yea >= needed);

  return {
    passed,
    yea,
    nay,
    abstain,
    total,
    threshold: needed ?? (threshold.fraction === '2/3' ? total * (2 / 3) : total / 2),
    requirement: threshold.fraction,
    ...(needed !== null ? { needed } : {}),
  };
}

/** The threshold an organization's setting for bylaw amendments gives, with its members counted */
export function thresholdFromSetting(setting: BylawAmendmentVote, members: number): VoteThreshold {
  switch (setting) {
    case 'majorityCast':
      return { fraction: 'majority', of: 'cast' };
    case 'majorityMembers':
      return { fraction: 'majority', of: 'members', members };
    case 'twoThirdsMembers':
      return { fraction: '2/3', of: 'members', members };
    default:
      return { fraction: '2/3', of: 'cast' };
  }
}

/**
 * A threshold in words, for the question card: "Majority", "Two thirds", or of all the members
 * "Two thirds of all 142 voting members: 95 votes needed"
 */
export function thresholdText(threshold: VoteThreshold): string {
  const fraction = threshold.fraction === '2/3' ? 'Two thirds' : 'Majority';
  const needed = votesNeeded(threshold);
  if (needed === null) return fraction;
  return `${fraction} of all ${threshold.members ?? 0} voting members: ${needed} ${needed === 1 ? 'vote' : 'votes'} needed`;
}

/**
 * The vote a motion (or a decided motion's record) needs: a bylaw amendment's own, stamped from
 * the organization's setting when it was moved; otherwise its definition's, of the votes cast
 */
export function motionThreshold(motion: {
  type: string;
  vote?: VoteRequirement;
  bylawAmendment?: BylawAmendment | null;
}): VoteThreshold {
  const own = motion.bylawAmendment?.voteRequired;
  if (own) return own;
  return asThreshold(motion.vote ?? MOTIONS[motion.type]?.vote ?? 'majority');
}

/**
 * RONR: the chair votes (outside a ballot) only when the chair's vote would change the result,
 * for example to break or make a tie, or to reach or block two-thirds. That is judged on the
 * votes already cast, so it is never true before anyone has voted.
 * @param votes - Current vote counts (device votes and the floor tally together), without the
 *   chair's vote
 * @param requirement - The vote requirement of the pending question
 */
export function canChairVoteDecide(
  votes: Votes,
  requirement: VoteRequirement | VoteThreshold,
): boolean {
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
