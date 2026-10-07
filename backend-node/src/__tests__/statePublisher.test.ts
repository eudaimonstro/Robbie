import { describe, it, expect, vi } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { CompletedMotion, MeetingState } from '@robbie-bylawyer/shared/types';
import { emitState, publicState } from '../socket/statePublisher.js';

const record = (method: CompletedMotion['method']): CompletedMotion => ({
  id: 1,
  type: 'mainMotion',
  name: 'Main Motion',
  text: 'Resurface the pool',
  passed: true,
  voterChoices: { 2: 'yea', 3: 'nay' },
  timestamp: '20:15',
  reconsidered: false,
  method,
});

const ballot: MeetingState = {
  ...initialState,
  votingOpen: true,
  votingMethod: 'ballot',
  votes: { yea: 1, nay: 1, abstain: 0 },
  voters: [2, 3],
  voterChoices: { 2: 'yea', 3: 'nay' },
};

describe('publicState', () => {
  it('leaves out who voted which way while a secret ballot is open', () => {
    const shown = publicState(ballot);
    expect(shown.voterChoices).toEqual({});
    // The counts and who has voted stay
    expect(shown.votes).toEqual(ballot.votes);
    expect(shown.voters).toEqual([2, 3]);
  });

  it('leaves out the choices recorded for a decided ballot, and keeps other records', () => {
    const state = { ...initialState, completedMotions: [record('ballot'), record('rollcall')] };
    const shown = publicState(state);
    expect(shown.completedMotions[0].voterChoices).toEqual({});
    expect(shown.completedMotions[1].voterChoices).toEqual({ 2: 'yea', 3: 'nay' });
  });

  it('sends any other state as it is', () => {
    const standard = { ...ballot, votingMethod: 'standard' as const };
    expect(publicState(standard)).toBe(standard);
  });
});

describe('emitState', () => {
  it("sends the meeting's room the public state", () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    emitState({ to } as never, 'TEST01', { state: ballot, stateVersion: 4 });
    expect(to).toHaveBeenCalledWith('meeting:TEST01');
    expect(emit).toHaveBeenCalledWith('STATE_UPDATE', {
      state: { ...ballot, voterChoices: {} },
      stateVersion: 4,
    });
  });
});
