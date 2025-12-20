import { useMemo } from 'react';
import type { Member } from '@robbie/shared/types';

/**
 * Custom hook to compute quorum status
 * @param members - Array of meeting members
 * @param quorum - Required number of members for quorum
 * @returns Object containing present count and quorum status
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
