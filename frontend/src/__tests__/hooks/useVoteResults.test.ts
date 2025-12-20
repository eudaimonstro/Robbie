import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useVoteResults } from '../../hooks/useVoteResults';
import type { MeetingLogEntry } from '@eudaimonstro/robbie-shared/types';

describe('useVoteResults', () => {
  it('should return null when meeting log is empty', () => {
    const { result } = renderHook(() => useVoteResults([]));
    expect(result.current).toBeNull();
  });

  it('should return null when no vote result in log', () => {
    const log: MeetingLogEntry[] = [
      { time: '10:00:00', message: 'Meeting called to order' },
      { time: '10:05:00', message: 'Motion made by John' },
    ];
    const { result } = renderHook(() => useVoteResults(log));
    expect(result.current).toBeNull();
  });

  it('should parse a CARRIED vote result', () => {
    const log: MeetingLogEntry[] = [
      { time: '10:00:00', message: 'Meeting called to order' },
      { time: '10:05:00', message: 'Chair puts the question: "Approve the budget"' },
      { time: '10:10:00', message: 'Vote: Yea 8, Nay 2. Motion CARRIED.' },
    ];
    const { result } = renderHook(() => useVoteResults(log));

    expect(result.current).not.toBeNull();
    expect(result.current?.yea).toBe(8);
    expect(result.current?.nay).toBe(2);
    expect(result.current?.outcome).toBe('CARRIED');
    expect(result.current?.passed).toBe(true);
    expect(result.current?.motionText).toBe('Approve the budget');
    expect(result.current?.timestamp).toBe('10:10:00');
  });

  it('should parse a FAILED vote result', () => {
    const log: MeetingLogEntry[] = [
      { time: '10:00:00', message: 'Meeting called to order' },
      { time: '10:05:00', message: 'Chair puts the question: "Increase dues"' },
      { time: '10:10:00', message: 'Vote: Yea 3, Nay 7. Motion FAILED.' },
    ];
    const { result } = renderHook(() => useVoteResults(log));

    expect(result.current).not.toBeNull();
    expect(result.current?.yea).toBe(3);
    expect(result.current?.nay).toBe(7);
    expect(result.current?.outcome).toBe('FAILED');
    expect(result.current?.passed).toBe(false);
    expect(result.current?.motionText).toBe('Increase dues');
  });

  it('should return the most recent vote when multiple votes exist', () => {
    const log: MeetingLogEntry[] = [
      { time: '10:00:00', message: 'Vote: Yea 5, Nay 5. Motion FAILED.' },
      { time: '10:30:00', message: 'Chair puts the question: "Second attempt"' },
      { time: '10:35:00', message: 'Vote: Yea 7, Nay 3. Motion CARRIED.' },
    ];
    const { result } = renderHook(() => useVoteResults(log));

    expect(result.current?.yea).toBe(7);
    expect(result.current?.nay).toBe(3);
    expect(result.current?.outcome).toBe('CARRIED');
  });

  it('should handle vote result without preceding motion text', () => {
    const log: MeetingLogEntry[] = [
      { time: '10:10:00', message: 'Vote: Yea 6, Nay 4. Motion CARRIED.' },
    ];
    const { result } = renderHook(() => useVoteResults(log));

    expect(result.current).not.toBeNull();
    expect(result.current?.yea).toBe(6);
    expect(result.current?.nay).toBe(4);
    expect(result.current?.motionText).toBeNull();
  });

  it('should memoize the result', () => {
    const log: MeetingLogEntry[] = [
      { time: '10:10:00', message: 'Vote: Yea 6, Nay 4. Motion CARRIED.' },
    ];
    const { result, rerender } = renderHook(() => useVoteResults(log));

    const firstResult = result.current;
    rerender();
    const secondResult = result.current;

    expect(firstResult).toBe(secondResult);
  });
});
