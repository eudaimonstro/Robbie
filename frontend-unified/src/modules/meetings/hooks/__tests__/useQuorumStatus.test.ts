import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { useQuorumStatus } from '../useQuorumStatus';

describe('useQuorumStatus', () => {
  it('counts what the server counts: devices, members marked present and the headcount', () => {
    const state: MeetingState = {
      ...initialState,
      quorum: 4,
      headcount: 2,
      members: [
        { id: 1, name: 'Ann', role: 'chair', present: true, presentBy: 'device' },
        { id: 2, name: 'Bo', role: 'member', present: true, presentBy: 'chair' },
        { id: 3, name: 'Cy', role: 'member', present: false },
        { id: 4, name: 'Guest', role: 'guest', present: true, presentBy: 'device' },
      ],
    };
    const { result } = renderHook(() => useQuorumStatus(state));
    expect(result.current).toEqual({
      presentCount: 4,
      effectiveCount: 4,
      totalMembers: 3,
      hasQuorum: true,
      proxyCount: 0,
    });
  });

  it('has no quorum below the count', () => {
    const state: MeetingState = {
      ...initialState,
      quorum: 3,
      members: [{ id: 1, name: 'Ann', role: 'member', present: true }],
    };
    const { result } = renderHook(() => useQuorumStatus(state));
    expect(result.current.hasQuorum).toBe(false);
    expect(result.current.presentCount).toBe(1);
  });
});
