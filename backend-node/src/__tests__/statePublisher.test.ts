import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initialState, meetingReducer } from '@robbie-bylawyer/shared/reducer';
import type { CompletedMotion, Election, MeetingState } from '@robbie-bylawyer/shared/types';
import {
  emitState,
  forgetBroadcasts,
  publicState,
  publicUpdate,
} from '../socket/statePublisher.js';

// Each test's first update goes out at once, whole
beforeEach(() => forgetBroadcasts());

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
    const shown = publicState(ballot, 'member');
    expect(shown.voterChoices).toEqual({});
    expect(shown.votes).toEqual({ yea: 0, nay: 0, abstain: 0 });
    // Who has voted stays, so the room can see the ballots come in (voters.length); the
    // tellers' count is the chair's own entry
    expect(shown.voters).toEqual([2, 3, 4]);
    expect(shown.floorVotes).toEqual(ballot.floorVotes);
  });

  it('leaves out the choice of each proxy vote while a secret ballot is open', () => {
    const shown = publicState(ballot, 'member');
    expect(shown.proxyVotes).toEqual([{ memberId: 4, castBy: 2 }]);
  });

  it('leaves out the choices recorded for a decided ballot, and keeps other records', () => {
    const state = { ...initialState, completedMotions: [record('ballot'), record('rollcall')] };
    const shown = publicState(state, 'member');
    expect(shown.completedMotions[0].voterChoices).toEqual({});
    expect(shown.completedMotions[1].voterChoices).toEqual({ 2: 'yea', 3: 'nay' });
  });

  it('leaves out the running count of an election while its ballot is open', () => {
    const shown = publicState({ ...initialState, currentElection: election }, 'member');
    expect(shown.currentElection).toEqual({ ...election, ballotResults: {} });
    // Decided: the count is the result
    const decided = { ...election, votingInProgress: false, elected: 'Ann' };
    expect(
      publicState({ ...initialState, currentElection: decided }, 'member').currentElection,
    ).toEqual(decided);
  });

  it("keeps the counts of an election's closed ballots, which the log announced, while the next is open", () => {
    const runoff = { ...election, ballots: [{ Ann: 4, Bo: 4 }] };
    const shown = publicState({ ...initialState, currentElection: runoff }, 'member');
    expect(shown.currentElection).toEqual({ ...runoff, ballotResults: {} });
  });

  it('sends no choice of a secret ballot the meeting adjourned during', () => {
    const adjourned = meetingReducer(
      { ...ballot, meetingActive: true },
      { type: 'END_MEETING', timestamp: '11:00:00' },
    );
    const shown = publicState(adjourned, 'member');
    expect(shown.voterChoices).toEqual({});
    expect(shown.proxyVotes).toEqual([]);
    expect(shown.votes).toEqual({ yea: 0, nay: 0, abstain: 0 });
  });

  it("gives a guest no previous minutes' text, only that there are minutes to approve", () => {
    const approving = {
      ...initialState,
      minutesFromPreviousMeeting: '# Minutes of the September meeting',
      previousMinutesId: 'minutes-1',
    };
    const guest = publicState(approving, 'guest');
    expect(guest.minutesFromPreviousMeeting).toBe('');
    expect(guest.previousMinutesId).toBe('minutes-1');
    for (const role of ['member', 'admin', 'chair'] as const) {
      expect(publicState(approving, role), role).toBe(approving);
    }
    // And the ballot stays secret for a guest too
    const both = publicState({ ...ballot, ...approving }, 'guest');
    expect(both.voterChoices).toEqual({});
    expect(both.minutesFromPreviousMeeting).toBe('');
  });

  it('sends any other state as it is', () => {
    const standard = { ...ballot, votingMethod: 'standard' as const };
    expect(publicState(standard, 'member')).toBe(standard);
  });
});

describe('publicUpdate', () => {
  it('leaves out who just voted while a secret ballot is open', () => {
    for (const actionType of ['CAST_VOTE', 'CAST_PROXY_VOTE']) {
      const shown = publicUpdate(
        {
          state: ballot,
          stateVersion: 4,
          triggeredBy: { actionType, userId: 2 },
        },
        'member',
      );
      expect(shown.triggeredBy, actionType).toEqual({ actionType, userId: 0 });
    }
  });

  it('says who did anything else', () => {
    const open = {
      state: ballot,
      stateVersion: 4,
      triggeredBy: { actionType: 'RAISE_HAND', userId: 2 },
    };
    expect(publicUpdate(open, 'member').triggeredBy).toEqual({
      actionType: 'RAISE_HAND',
      userId: 2,
    });
    const standard = { ...ballot, votingMethod: 'standard' as const };
    const vote = {
      state: standard,
      stateVersion: 4,
      triggeredBy: { actionType: 'CAST_VOTE', userId: 2 },
    };
    expect(publicUpdate(vote, 'member').triggeredBy).toEqual({
      actionType: 'CAST_VOTE',
      userId: 2,
    });
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

describe('emitState while the previous minutes are before the meeting', () => {
  const approving: MeetingState = {
    ...initialState,
    minutesFromPreviousMeeting: '# Minutes of the September meeting',
    previousMinutesId: 'minutes-1',
  };

  /** An io with these sockets in the meeting's room, recording what each emit sends where */
  function ioWith(sockets: Record<string, { role: string }>) {
    const sent: Array<{ to: string[]; except: string[]; payload: unknown }> = [];
    const target = (to: string[], except: string[] = []) => ({
      except: (ids: string[]) => target(to, [...except, ...ids]),
      emit: (_event: string, payload: unknown) => sent.push({ to, except, payload }),
    });
    const io = {
      sockets: {
        adapter: { rooms: new Map([['meeting:TEST01', new Set(Object.keys(sockets))]]) },
        sockets: new Map(Object.entries(sockets).map(([id, data]) => [id, { data }])),
      },
      to: (room: string | string[]) => target(Array.isArray(room) ? room : [room]),
    };
    return { io: io as never, sent };
  }

  it('sends members the minutes and guests the state without their text', () => {
    const { io, sent } = ioWith({
      a: { role: 'member' },
      b: { role: 'guest' },
      c: { role: 'chair' },
    });
    emitState(io, 'TEST01', { state: approving, stateVersion: 5 });
    expect(sent).toEqual([
      {
        to: ['meeting:TEST01'],
        except: ['b'],
        payload: { state: approving, stateVersion: 5 },
      },
      {
        to: ['b'],
        except: [],
        payload: { state: { ...approving, minutesFromPreviousMeeting: '' }, stateVersion: 5 },
      },
    ]);
  });

  it('sends one update to the room when no guest is in it', () => {
    const { io, sent } = ioWith({ a: { role: 'member' } });
    emitState(io, 'TEST01', { state: approving, stateVersion: 5 });
    expect(sent).toEqual([
      { to: ['meeting:TEST01'], except: [], payload: { state: approving, stateVersion: 5 } },
    ]);
  });
});
