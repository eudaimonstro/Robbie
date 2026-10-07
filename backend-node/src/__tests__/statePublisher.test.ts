import { describe, it, expect, vi } from 'vitest';
import { initialState, meetingReducer } from '@robbie-bylawyer/shared/reducer';
import type { CompletedMotion, Election, MeetingState } from '@robbie-bylawyer/shared/types';
import { emitState, publicState, publicUpdate } from '../socket/statePublisher.js';

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
  votes: { yea: 2, nay: 1, abstain: 0 },
  floorVotes: { yea: 4, nay: 2, abstain: 0 },
  voters: [2, 3, 4],
  voterChoices: { 2: 'yea', 3: 'nay', 4: 'yea' },
  proxyVotes: [{ memberId: 4, castBy: 2, vote: 'yea' }],
};

const election: Election = {
  id: 1,
  position: 'Treasurer',
  candidates: [
    { name: 'Ann', id: 2 },
    { name: 'Bo', id: 3 },
  ],
  requiredVotes: 'majority',
  votingInProgress: true,
  ballotResults: { Ann: 3, Bo: 1 },
  votersWhoVoted: [2, 3, 4, 5],
  floorBallots: { Ann: 2 },
  elected: null,
};

describe('publicState', () => {
  it('leaves out who voted which way, and the running totals, while a secret ballot is open', () => {
    const shown = publicState(ballot);
    expect(shown.voterChoices).toEqual({});
    expect(shown.votes).toEqual({ yea: 0, nay: 0, abstain: 0 });
    // Who has voted stays, so the room can see the ballots come in (voters.length); the
    // tellers' count is the chair's own entry
    expect(shown.voters).toEqual([2, 3, 4]);
    expect(shown.floorVotes).toEqual(ballot.floorVotes);
  });

  it('leaves out the choice of each proxy vote while a secret ballot is open', () => {
    const shown = publicState(ballot);
    expect(shown.proxyVotes).toEqual([{ memberId: 4, castBy: 2 }]);
  });

  it('leaves out the choices recorded for a decided ballot, and keeps other records', () => {
    const state = { ...initialState, completedMotions: [record('ballot'), record('rollcall')] };
    const shown = publicState(state);
    expect(shown.completedMotions[0].voterChoices).toEqual({});
    expect(shown.completedMotions[1].voterChoices).toEqual({ 2: 'yea', 3: 'nay' });
  });

  it('leaves out the running count of an election while its ballot is open', () => {
    const shown = publicState({ ...initialState, currentElection: election });
    expect(shown.currentElection).toEqual({ ...election, ballotResults: {} });
    // Decided: the count is the result
    const decided = { ...election, votingInProgress: false, elected: 'Ann' };
    expect(publicState({ ...initialState, currentElection: decided }).currentElection).toEqual(
      decided,
    );
  });

  it('sends no choice of a secret ballot the meeting adjourned during', () => {
    const adjourned = meetingReducer(
      { ...ballot, meetingActive: true },
      { type: 'END_MEETING', timestamp: '11:00:00' },
    );
    const shown = publicState(adjourned);
    expect(shown.voterChoices).toEqual({});
    expect(shown.proxyVotes).toEqual([]);
    expect(shown.votes).toEqual({ yea: 0, nay: 0, abstain: 0 });
  });

  it('sends any other state as it is', () => {
    const standard = { ...ballot, votingMethod: 'standard' as const };
    expect(publicState(standard)).toBe(standard);
  });
});

describe('publicUpdate', () => {
  it('leaves out who just voted while a secret ballot is open', () => {
    for (const actionType of ['CAST_VOTE', 'CAST_PROXY_VOTE']) {
      const shown = publicUpdate({
        state: ballot,
        stateVersion: 4,
        triggeredBy: { actionType, userId: 2 },
      });
      expect(shown.triggeredBy, actionType).toEqual({ actionType, userId: 0 });
    }
  });

  it('says who did anything else', () => {
    const open = {
      state: ballot,
      stateVersion: 4,
      triggeredBy: { actionType: 'RAISE_HAND', userId: 2 },
    };
    expect(publicUpdate(open).triggeredBy).toEqual({ actionType: 'RAISE_HAND', userId: 2 });
    const standard = { ...ballot, votingMethod: 'standard' as const };
    const vote = {
      state: standard,
      stateVersion: 4,
      triggeredBy: { actionType: 'CAST_VOTE', userId: 2 },
    };
    expect(publicUpdate(vote).triggeredBy).toEqual({ actionType: 'CAST_VOTE', userId: 2 });
  });
});

describe('emitState', () => {
  it("sends the meeting's room the public state", () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    emitState({ to } as never, 'TEST01', {
      state: ballot,
      stateVersion: 4,
      triggeredBy: { actionType: 'CAST_VOTE', userId: 3 },
    });
    expect(to).toHaveBeenCalledWith('meeting:TEST01');
    expect(emit).toHaveBeenCalledWith('STATE_UPDATE', {
      state: {
        ...ballot,
        votes: { yea: 0, nay: 0, abstain: 0 },
        voterChoices: {},
        proxyVotes: [{ memberId: 4, castBy: 2 }],
      },
      stateVersion: 4,
      triggeredBy: { actionType: 'CAST_VOTE', userId: 0 },
    });
  });
});
