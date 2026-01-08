import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useQuorumStatus } from '../../hooks/useQuorumStatus';
import type { Member } from '@robbie-bylawyer/shared/types';

describe('useQuorumStatus', () => {
  const createMembers = (presentCount: number, totalCount: number): Member[] => {
    return Array.from({ length: totalCount }, (_, i) => ({
      id: i + 1,
      name: `Member ${i + 1}`,
      role: 'member' as const,
      present: i < presentCount,
    }));
  };

  it('should return correct counts with all members present', () => {
    const members = createMembers(5, 5);
    const { result } = renderHook(() => useQuorumStatus(members, 3));

    expect(result.current.presentCount).toBe(5);
    expect(result.current.totalMembers).toBe(5);
    expect(result.current.hasQuorum).toBe(true);
  });

  it('should return hasQuorum false when below quorum', () => {
    const members = createMembers(2, 5);
    const { result } = renderHook(() => useQuorumStatus(members, 3));

    expect(result.current.presentCount).toBe(2);
    expect(result.current.totalMembers).toBe(5);
    expect(result.current.hasQuorum).toBe(false);
  });

  it('should return hasQuorum true when exactly at quorum', () => {
    const members = createMembers(3, 5);
    const { result } = renderHook(() => useQuorumStatus(members, 3));

    expect(result.current.presentCount).toBe(3);
    expect(result.current.hasQuorum).toBe(true);
  });

  it('should handle empty members array', () => {
    const { result } = renderHook(() => useQuorumStatus([], 3));

    expect(result.current.presentCount).toBe(0);
    expect(result.current.totalMembers).toBe(0);
    expect(result.current.hasQuorum).toBe(false);
  });

  it('should handle quorum of 1', () => {
    const members = createMembers(1, 5);
    const { result } = renderHook(() => useQuorumStatus(members, 1));

    expect(result.current.hasQuorum).toBe(true);
  });

  it('should memoize the result', () => {
    const members = createMembers(3, 5);
    const { result, rerender } = renderHook(() => useQuorumStatus(members, 3));

    const firstResult = result.current;
    rerender();
    const secondResult = result.current;

    expect(firstResult).toBe(secondResult);
  });

  it('should update when members change', () => {
    const initialMembers = createMembers(2, 5);
    const { result, rerender } = renderHook(
      ({ members, quorum }) => useQuorumStatus(members, quorum),
      { initialProps: { members: initialMembers, quorum: 3 } }
    );

    expect(result.current.hasQuorum).toBe(false);

    const updatedMembers = createMembers(4, 5);
    rerender({ members: updatedMembers, quorum: 3 });

    expect(result.current.hasQuorum).toBe(true);
    expect(result.current.presentCount).toBe(4);
  });
});
