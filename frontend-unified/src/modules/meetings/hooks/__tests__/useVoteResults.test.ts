import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { parseVoteResult, useVoteResults } from '../useVoteResults';
import type { MeetingLogEntry, MeetingState } from '@robbie-bylawyer/shared/types';
import { initialState, meetingReducer } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';

describe('useVoteResults', () => {
  // Runs a vote through the reducer so the log has the messages the app really writes
  function logOfVote(yeas: number, nays: number, withoutQuorum = false): MeetingLogEntry[] {
    const motion = {
      ...MOTIONS.mainMotion,
      id: 1,
      type: 'mainMotion',
      text: 'Approve the budget',
      mover: 'Member 1',
      moverId: 1,
      secondedBy: 'Member 2',
      status: 'active' as const,
    };
    const voterIds = Array.from({ length: yeas + nays }, (_, i) => i + 1);
    let state: MeetingState = {
      ...initialState,
      meetingActive: true,
      members: voterIds.map((id) => ({ id, name: `Member ${id}`, role: 'member', present: true })),
      currentMotion: motion,
      motionStack: [motion],
    };
    state = meetingReducer(state, {
      type: 'OPEN_VOTING',
      voteTimerEnd: null,
      timestamp: '10:05:00',
      withoutQuorum,
    });
    voterIds.forEach((voterId, i) => {
      state = meetingReducer(state, { type: 'CAST_VOTE', voterId, vote: i < yeas ? 'yea' : 'nay' });
    });
    return meetingReducer(state, { type: 'CLOSE_VOTING', timestamp: '10:10:00' }).meetingLog;
  }

  it('reads a vote the reducer recorded as carried', () => {
    const { result } = renderHook(() => useVoteResults(logOfVote(3, 1)));
    expect(result.current).toMatchObject({
      yea: 3,
      nay: 1,
      outcome: 'CARRIED',
      passed: true,
      motionText: 'Approve the budget',
      timestamp: '10:10:00',
    });
  });

  it('reads a vote the reducer recorded as failed', () => {
    const { result } = renderHook(() => useVoteResults(logOfVote(1, 3)));
    expect(result.current).toMatchObject({ yea: 1, nay: 3, outcome: 'FAILED', passed: false });
  });

  it('finds the question when a quorum warning follows it', () => {
    const { result } = renderHook(() => useVoteResults(logOfVote(3, 1, true)));
    expect(result.current?.motionText).toBe('Approve the budget');
  });

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
      { time: '10:10:00', message: 'Vote: Yea 8, Nay 2. CARRIED.' },
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
      { time: '10:10:00', message: 'Vote: Yea 3, Nay 7. FAILED.' },
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
      { time: '10:00:00', message: 'Vote: Yea 5, Nay 5. FAILED.' },
      { time: '10:30:00', message: 'Chair puts the question: "Second attempt"' },
      { time: '10:35:00', message: 'Vote: Yea 7, Nay 3. CARRIED.' },
    ];
    const { result } = renderHook(() => useVoteResults(log));

    expect(result.current?.yea).toBe(7);
    expect(result.current?.nay).toBe(3);
    expect(result.current?.outcome).toBe('CARRIED');
  });

  it('should handle vote result without preceding motion text', () => {
    const log: MeetingLogEntry[] = [{ time: '10:10:00', message: 'Vote: Yea 6, Nay 4. CARRIED.' }];
    const { result } = renderHook(() => useVoteResults(log));

    expect(result.current).not.toBeNull();
    expect(result.current?.yea).toBe(6);
    expect(result.current?.nay).toBe(4);
    // Empty string rather than null, so a result's motionText stays a string
    expect(result.current?.motionText).toBe('');
  });

  it('should memoize the result', () => {
    const log: MeetingLogEntry[] = [{ time: '10:10:00', message: 'Vote: Yea 6, Nay 4. CARRIED.' }];
    const { result, rerender } = renderHook(() => useVoteResults(log));

    const firstResult = result.current;
    rerender();
    const secondResult = result.current;

    expect(firstResult).toBe(secondResult);
  });
});

describe('parseVoteResult with a floor tally', () => {
  const log = (message: string): MeetingLogEntry[] => [
    { time: '19:41:00', message: 'Chair puts the question: "Approve the pool contract"' },
    { time: '19:45:00', message },
  ];

  it('reads both parts and writes the tally the room reads', () => {
    const result = parseVoteResult(
      log('Vote: Yea 21, Nay 5. CARRIED. On devices 12 to 3, in the room 9 to 2.'),
    );
    expect(result).toMatchObject({
      yea: 21,
      nay: 5,
      outcome: 'CARRIED',
      parts: { device: { yea: 12, nay: 3 }, floor: { yea: 9, nay: 2 } },
      tally: 'On devices 12 to 3, in the room 9 to 2: 21 to 5',
    });
  });

  it('gives the total alone without a floor tally', () => {
    const result = parseVoteResult(log('Vote: Yea 6, Nay 4. FAILED.'));
    expect(result).toMatchObject({ parts: null, tally: '6 to 4', passed: false });
  });

  it('treats the vote as old news once something else is decided', () => {
    const decided = (message: string) => [
      ...log('Vote: Yea 6, Nay 4. CARRIED.'),
      { time: '19:50:00', message },
    ];
    expect(parseVoteResult(decided('Motion CARRIED by unanimous consent.'))).toBeNull();
    expect(
      parseVoteResult(
        decided('Voting closed for Director. Results: Carmen Diaz: 9. Carmen Diaz elected.'),
      ),
    ).toBeNull();
    expect(parseVoteResult(decided('Chair declares Carmen Diaz elected as Director.'))).toBeNull();
  });
});
