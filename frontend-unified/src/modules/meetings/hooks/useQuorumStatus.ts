import { useMemo } from 'react';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';

/**
 * Quorum for the meeting, counted by attendanceSummary (shared), as the server counts it: members
 * present on a device, members the chair marked present, the headcount of people without an
 * account, and proxies when they count; never guests.
 *
 * @returns
 *   - `presentCount` and `effectiveCount`: everyone who counts toward quorum
 *   - `totalMembers`: the members in the meeting who can vote (not guests)
 *   - `hasQuorum`
 *   - `proxyCount`: absent members represented by a present proxy holder
 */
export function useQuorumStatus(state: MeetingState) {
  return useMemo(() => {
    const summary = attendanceSummary(state);
    return {
      presentCount: summary.present,
      effectiveCount: summary.present,
      totalMembers: state.members.filter((m) => m.role !== 'guest').length,
      hasQuorum: summary.hasQuorum,
      proxyCount: summary.proxies,
    };
  }, [state]);
}
