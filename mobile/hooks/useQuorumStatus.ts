import { useMemo } from 'react';
import type { Member, ProxyAuthorization } from '@robbie-bylawyer/shared/types';

interface QuorumOptions {
  proxiesCountForQuorum?: boolean;
  proxies?: ProxyAuthorization[];
}

/**
 * Custom hook to compute quorum status for the meeting
 */
export function useQuorumStatus(members: Member[], quorum: number, options?: QuorumOptions) {
  return useMemo(() => {
    const presentCount = members.filter((m) => m.present).length;

    // Count absent members who have granted proxies to present members
    let proxyCount = 0;
    if (options?.proxiesCountForQuorum && options?.proxies) {
      const presentMemberIds = new Set(members.filter((m) => m.present).map((m) => m.id));
      proxyCount = options.proxies.filter(
        (p) => presentMemberIds.has(p.grantedTo) && !presentMemberIds.has(p.grantedBy),
      ).length;
    }

    const effectiveCount = presentCount + proxyCount;
    const hasQuorum = effectiveCount >= quorum;

    return {
      presentCount,
      effectiveCount,
      totalMembers: members.length,
      hasQuorum,
      proxyCount,
    };
  }, [members, quorum, options?.proxiesCountForQuorum, options?.proxies]);
}
