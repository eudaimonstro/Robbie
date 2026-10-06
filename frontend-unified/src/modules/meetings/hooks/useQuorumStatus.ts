import { useMemo } from 'react';
import type { Member, ProxyAuthorization } from '@robbie-bylawyer/shared/types';

interface QuorumOptions {
  proxiesCountForQuorum?: boolean;
  proxies?: ProxyAuthorization[];
}

/**
 * Custom hook to compute quorum status for the meeting
 *
 * Quorum is the minimum number of members required to conduct official business.
 * This hook memoizes the calculation to avoid unnecessary re-renders.
 *
 * @param members - Array of meeting members
 * @param quorum - Required number of members for quorum
 * @param options - Optional settings:
 *   - `proxiesCountForQuorum`: Whether absent members with proxies count toward quorum
 *   - `proxies`: Array of active proxy authorizations
 * @returns Quorum status object:
 *   - `presentCount`: Number of members currently marked as present (physical)
 *   - `effectiveCount`: Present + proxy-represented members (if proxies count)
 *   - `totalMembers`: Total number of members in the meeting
 *   - `hasQuorum`: Boolean indicating if quorum requirement is met
 *   - `proxyCount`: Number of absent members represented by proxy
 *
 * @example
 * ```tsx
 * const { presentCount, effectiveCount, hasQuorum } = useQuorumStatus(
 *   state.members,
 *   state.quorum,
 *   { proxiesCountForQuorum: state.proxiesCountForQuorum, proxies: state.proxies }
 * );
 * ```
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
