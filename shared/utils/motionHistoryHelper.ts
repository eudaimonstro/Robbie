import type { MeetingState } from '../types/index.js';

export type MotionOutcome = 'passed' | 'failed' | 'tabled' | 'pending';

export interface HistoricalMotion {
  id: number;
  type: string;
  name: string;
  text: string;
  mover: string;
  outcome: MotionOutcome;
  timestamp: string;
  voteCount?: { yea: number; nay: number; abstain: number };
  voterChoices?: Record<number, 'yea' | 'nay' | 'abstain'>;
}

export interface MotionHistoryFilters {
  outcome?: MotionOutcome | 'all';
  type?: string | 'all';
  searchText?: string;
}

/**
 * Get all motion history from the meeting state
 */
export function getMotionHistory(state: MeetingState): HistoricalMotion[] {
  const history: HistoricalMotion[] = [];

  // Add completed motions (passed/failed)
  state.completedMotions.forEach((motion) => {
    const voteCount = calculateVoteCount(motion.voterChoices);
    history.push({
      id: motion.id,
      type: motion.type,
      name: motion.name,
      text: motion.text,
      mover: '', // Not stored in completedMotions
      outcome: motion.passed ? 'passed' : 'failed',
      timestamp: motion.timestamp,
      voteCount,
      voterChoices: motion.voterChoices,
    });
  });

  // Add tabled motions
  state.tabledMotions.forEach((motion) => {
    history.push({
      id: motion.id,
      type: motion.type,
      name: motion.name,
      text: motion.text,
      mover: motion.mover,
      outcome: 'tabled',
      timestamp: '', // Would need to track when it was tabled
    });
  });

  // Add current pending motions (motion stack)
  state.motionStack.forEach((motion) => {
    history.push({
      id: motion.id,
      type: motion.type,
      name: motion.name,
      text: motion.text,
      mover: motion.mover,
      outcome: 'pending',
      timestamp: '', // In progress
    });
  });

  // Sort by timestamp (most recent first), pending motions at top
  return history.sort((a, b) => {
    if (a.outcome === 'pending' && b.outcome !== 'pending') return -1;
    if (a.outcome !== 'pending' && b.outcome === 'pending') return 1;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return b.timestamp.localeCompare(a.timestamp);
  });
}

/**
 * Filter motion history based on criteria
 */
export function filterMotionHistory(
  history: HistoricalMotion[],
  filters: MotionHistoryFilters,
): HistoricalMotion[] {
  return history.filter((motion) => {
    // Filter by outcome
    if (filters.outcome && filters.outcome !== 'all' && motion.outcome !== filters.outcome) {
      return false;
    }

    // Filter by type
    if (filters.type && filters.type !== 'all' && motion.type !== filters.type) {
      return false;
    }

    // Filter by search text
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      const textMatch = motion.text.toLowerCase().includes(searchLower);
      const nameMatch = motion.name.toLowerCase().includes(searchLower);
      const moverMatch = motion.mover.toLowerCase().includes(searchLower);
      if (!textMatch && !nameMatch && !moverMatch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Get unique motion types from history for filtering
 */
export function getMotionTypes(history: HistoricalMotion[]): string[] {
  const types = new Set<string>();
  history.forEach((motion) => types.add(motion.type));
  return Array.from(types).sort();
}

/**
 * Get summary statistics for motion history
 */
export function getMotionHistoryStats(history: HistoricalMotion[]): {
  total: number;
  passed: number;
  failed: number;
  tabled: number;
  pending: number;
} {
  return {
    total: history.length,
    passed: history.filter((m) => m.outcome === 'passed').length,
    failed: history.filter((m) => m.outcome === 'failed').length,
    tabled: history.filter((m) => m.outcome === 'tabled').length,
    pending: history.filter((m) => m.outcome === 'pending').length,
  };
}

/**
 * Calculate vote counts from voter choices
 */
function calculateVoteCount(voterChoices: Record<number, 'yea' | 'nay' | 'abstain'>): {
  yea: number;
  nay: number;
  abstain: number;
} {
  const counts = { yea: 0, nay: 0, abstain: 0 };
  for (const vote of Object.values(voterChoices)) {
    counts[vote]++;
  }
  return counts;
}
