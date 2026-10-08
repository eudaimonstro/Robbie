import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { CompletedMotion } from '@robbie-bylawyer/shared/types';
import { mergeStateUpdate } from '../stateUpdates';

const decided = (id: number): CompletedMotion => ({
  id,
  type: 'mainMotion',
  name: 'Main Motion',
  text: `Motion ${id}`,
  passed: true,
  voterChoices: {},
  timestamp: '7:00 PM',
  reconsidered: false,
  method: 'standard',
});

describe('mergeStateUpdate', () => {
  it('takes a whole state as it is', () => {
    const state = { ...initialState, quorum: 3 };
    expect(mergeStateUpdate(initialState, 1, { state, stateVersion: 2 })).toBe(state);
  });

  it('adds the decided motions sent to the ones the client has', () => {
    const mine = { ...initialState, completedMotions: [decided(1)] };
    const merged = mergeStateUpdate(mine, 4, {
      state: { ...initialState, completedMotions: [decided(2)] },
      stateVersion: 6,
      baseVersion: 4,
      tails: { completedMotions: 1 },
    });
    expect(merged?.completedMotions.map((m) => m.id)).toEqual([1, 2]);
  });

  it("can't apply a tail that starts past the history the client has", () => {
    const merged = mergeStateUpdate(initialState, 4, {
      state: { ...initialState, completedMotions: [decided(3)] },
      stateVersion: 6,
      baseVersion: 4,
      tails: { completedMotions: 2 },
    });
    expect(merged).toBeNull();
  });

  it("can't apply an update that builds on a version the client doesn't have", () => {
    const merged = mergeStateUpdate(initialState, 4, {
      state: initialState,
      stateVersion: 9,
      baseVersion: 7,
      tails: { meetingLog: 0 },
    });
    expect(merged).toBeNull();
  });
});
