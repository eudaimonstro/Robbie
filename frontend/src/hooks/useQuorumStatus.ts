import { useMemo } from 'react';
import type { Member } from '@robbie/shared/types';

/**
 * Custom hook to compute quorum status for the meeting
 *
 * Quorum is the minimum number of members required to conduct official business.
 * This hook memoizes the calculation to avoid unnecessary re-renders.
 *
 * @param members - Array of meeting members
 * @param quorum - Required number of members for quorum
 * @returns Quorum status object:
 *   - `presentCount`: Number of members currently marked as present
 *   - `totalMembers`: Total number of members in the meeting
 *   - `hasQuorum`: Boolean indicating if quorum requirement is met
 *
 * @example
 * ```tsx
 * const { presentCount, totalMembers, hasQuorum } = useQuorumStatus(state.members, state.quorum);
 * if (!hasQuorum) {
 *   console.warn(`Only ${presentCount}/${quorum} members present`);
 * }
 * ```
 */
export function useQuorumStatus(members: Member[], quorum: number) {
  return useMemo(() => {
    const presentCount = members.filter(m => m.present).length;
    const hasQuorum = presentCount >= quorum;

    return {
      presentCount,
      totalMembers: members.length,
      hasQuorum
    };
  }, [members, quorum]);
}
