import { describe, it, expect } from 'vitest';
import { meetingReducer, initialState } from '../../reducer/index.js';
import { MOTIONS } from '../../constants/index.js';
import { getValidMotions } from '../../utils/index.js';
import type { Election, MeetingState, Motion, VotingMethod } from '../../types/index.js';

const motion = (overrides: Partial<Motion> = {}): Motion => ({
  ...MOTIONS.mainMotion,
  id: 1,
  type: 'mainMotion',
  text: 'Resurface the pool',
  mover: 'Ann',
  moverId: 1,
  secondedBy: 'Bo',
  status: 'active',
  ...overrides,
});

/** A vote in progress on `question`, with these device votes and floor tally */
function voting(
  question: Motion,
  votes: { yea: number; nay: number; abstain?: number },
  floor: { yea: number; nay: number; abstain?: number },
  votingMethod: VotingMethod = 'standard',
): MeetingState {
  return {
    ...initialState,
    meetingActive: true,
    votingOpen: true,
    votingMethod,
    currentMotion: question,
    motionStack: [question],
    votes: { abstain: 0, ...votes },
    floorVotes: { abstain: 0, ...floor },
  };
}

const close = (state: MeetingState) =>
  meetingReducer(state, { type: 'CLOSE_VOTING', timestamp: '20:15' });

describe('floor tallies', () => {
  it('start each vote at nothing', () => {
    const before = {
      ...voting(motion(), { yea: 0, nay: 0 }, { yea: 4, nay: 1 }),
      votingOpen: false,
    };
    const opened = meetingReducer(before, {
      type: 'OPEN_VOTING',
      voteTimerEnd: null,
      timestamp: '20:10',
    });
    expect(opened.floorVotes).toEqual({ yea: 0, nay: 0, abstain: 0 });
  });

  it('are replaced by each entry, so a correction is a new entry', () => {
    const state = voting(motion(), { yea: 1, nay: 0 }, { yea: 9, nay: 2 });
    const next = meetingReducer(state, {
      type: 'SET_FLOOR_TALLY',
      yea: 8,
      nay: 3,
      abstain: 1,
      timestamp: '20:12',
    });
    expect(next.floorVotes).toEqual({ yea: 8, nay: 3, abstain: 1 });
    expect(next.meetingLog).toEqual(state.meetingLog);
  });

  it('count with the device votes when the vote closes, and both parts are logged', () => {
    const closed = close(voting(motion(), { yea: 12, nay: 3 }, { yea: 9, nay: 2 }));
    expect(closed.meetingLog.at(-1)?.message).toBe(
      'Vote: Yea 21, Nay 5. CARRIED. On devices 12 to 3, in the room 9 to 2.',
    );
  });

  it('decide a two-thirds vote that only both parts together reach', () => {
    const question = motion({ vote: '2/3' });
    // On devices alone 4 to 3 falls short of two thirds; with the room, 10 to 5 is exactly it
    const closed = close(voting(question, { yea: 4, nay: 3 }, { yea: 6, nay: 2 }));
    expect(closed.completedMotions.at(-1)?.passed).toBe(true);
    const short = close(voting(question, { yea: 4, nay: 3 }, { yea: 5, nay: 2 }));
    expect(short.completedMotions.at(-1)?.passed).toBe(false);
  });

  it('are the whole of a voice vote, which takes no device votes', () => {
    const state = voting(motion(), { yea: 0, nay: 0 }, { yea: 0, nay: 0 }, 'voice');
    const cast = meetingReducer(state, {
      type: 'CAST_VOTE',
      vote: 'yea',
      voterId: 1,
      timestamp: '20:11',
    });
    expect(cast).toBe(state);

    const closed = close({ ...state, floorVotes: { yea: 30, nay: 4, abstain: 0 } });
    expect(closed.meetingLog.at(-1)?.message).toBe('Vote: Yea 30, Nay 4. CARRIED.');
    expect(closed.completedMotions.at(-1)).toMatchObject({
      method: 'voice',
      deviceVotes: { yea: 0, nay: 0, abstain: 0 },
      floorVotes: { yea: 30, nay: 4, abstain: 0 },
    });
  });
});

describe('the record of a vote', () => {
  it('is kept for every decided motion, with both parts and the method', () => {
    // A recess can't be reconsidered; before, its vote left no record
    const recess = motion({
      ...MOTIONS.recess,
      id: 5,
      type: 'recess',
      text: 'Recess for 10 minutes',
    });
    const state = {
      ...voting(recess, { yea: 3, nay: 1 }, { yea: 2, nay: 0 }),
      voterChoices: { 1: 'yea' as const, 2: 'yea' as const, 3: 'yea' as const, 4: 'nay' as const },
    };
    const closed = close(state);
    expect(closed.completedMotions).toEqual([
      {
        id: 5,
        type: 'recess',
        name: MOTIONS.recess.name,
        text: 'Recess for 10 minutes',
        mover: 'Ann',
        moverId: 1,
        passed: true,
        voterChoices: state.voterChoices,
        timestamp: '20:15',
        reconsidered: false,
        reconsiderable: false,
        deviceVotes: { yea: 3, nay: 1, abstain: 0 },
        floorVotes: { yea: 2, nay: 0, abstain: 0 },
        method: 'standard',
      },
    ]);
  });

  it('keeps no choices for a secret ballot, and clears them when it closes', () => {
    const state = {
      ...voting(motion(), { yea: 2, nay: 1 }, { yea: 0, nay: 0 }, 'ballot'),
      voterChoices: { 1: 'yea' as const, 2: 'yea' as const, 3: 'nay' as const },
      proxyVotes: [{ memberId: 3, castBy: 2, vote: 'nay' as const }],
    };
    const closed = close(state);
    const record = closed.completedMotions.at(-1)!;
    expect(record).toMatchObject({ voterChoices: {}, method: 'ballot' });
    expect(record).not.toHaveProperty('proxyVotes');
    expect(closed.voterChoices).toEqual({});
    // The proxy choices would otherwise show who voted which way once the ballot closed
    expect(closed.proxyVotes).toEqual([]);
  });

  it("isn't offered for reconsideration when its motion can't be reconsidered", () => {
    const record = {
      id: 5,
      type: 'recess',
      name: 'Recess',
      text: 'Recess for 10 minutes',
      passed: true,
      voterChoices: { 1: 'yea' as const },
      timestamp: '20:15',
      reconsidered: false,
    };
    const offered = (reconsiderable?: boolean) =>
      getValidMotions(
        { ...initialState, meetingActive: true, completedMotions: [{ ...record, reconsiderable }] },
        1,
      ).map((m) => m.key);
    expect(offered(false)).not.toContain('reconsider');
    expect(offered(true)).toContain('reconsider');
    // A record made before the flag existed was of a motion that can be reconsidered
    expect(offered(undefined)).toContain('reconsider');
  });
});

describe('floor ballots in elections', () => {
  const election = (overrides: Partial<Election> = {}): Election => ({
    id: 1,
    position: 'Director',
    candidates: [
      { name: 'Ann', id: 1 },
      { name: 'Bo', id: 2 },
    ],
    requiredVotes: 'majority',
    votingInProgress: true,
    ballotResults: { Ann: 3, Bo: 4 },
    votersWhoVoted: [1, 2, 3, 4, 5, 6, 7],
    floorBallots: {},
    elected: null,
    ...overrides,
  });
  const inElection = (e: Election): MeetingState => ({ ...initialState, currentElection: e });

  it('start empty, and are replaced by each entry', () => {
    const started = meetingReducer(
      {
        ...initialState,
        nominations: [
          {
            id: 1,
            position: 'Director',
            nomineeName: 'Ann',
            nomineeId: 1,
            nominatedBy: 'Bo',
            nominatorId: 2,
            timestamp: '20:20',
            declined: false,
          },
        ],
      },
      {
        type: 'START_ELECTION',
        electionId: 9,
        position: 'Director',
        requiredVotes: 'majority',
        timestamp: '20:21',
      },
    );
    expect(started.currentElection?.floorBallots).toEqual({});

    const entered = meetingReducer(inElection(election()), {
      type: 'SET_FLOOR_BALLOTS',
      counts: { Ann: 6, Bo: 1 },
      timestamp: '20:25',
    });
    expect(entered.currentElection?.floorBallots).toEqual({ Ann: 6, Bo: 1 });
  });

  it('count with the device ballots when the election closes', () => {
    // On devices Bo leads 4 to 3; the paper ballots make it Ann 9 to Bo 5, a majority of 14
    const closed = meetingReducer(inElection(election({ floorBallots: { Ann: 6, Bo: 1 } })), {
      type: 'CLOSE_ELECTION',
      timestamp: '20:30',
    });
    expect(closed.currentElection?.elected).toBe('Ann');
    expect(closed.meetingLog.at(-1)?.message).toBe(
      'Voting closed for Director. Results: Ann: 9 vote(s), Bo: 5 vote(s). Ann elected.',
    );
  });

  it('stay in the tally when someone is elected, so the result can be declared', () => {
    // Every ballot is on paper, and the winner is a write-in the devices never saw
    const closed = meetingReducer(
      inElection(
        election({
          ballotResults: { Ann: 0, Bo: 0 },
          votersWhoVoted: [],
          floorBallots: { Carmen: 18, Ann: 9 },
        }),
      ),
      { type: 'CLOSE_ELECTION', timestamp: '20:30' },
    );
    expect(closed.currentElection).toMatchObject({
      elected: 'Carmen',
      votingInProgress: false,
      ballotResults: { Carmen: 18, Ann: 9, Bo: 0 },
    });

    const declared = meetingReducer(closed, {
      type: 'DECLARE_ELECTED',
      candidateName: 'Carmen',
      timestamp: '20:31',
    });
    expect(declared.electedOfficers).toEqual([
      { position: 'Director', name: 'Carmen', memberId: 0, electedAt: '20:31' },
    ]);
    expect(declared.currentElection).toBeNull();
  });

  it('start again empty on a runoff', () => {
    const tied = election({ floorBallots: { Ann: 1 } });
    const closed = meetingReducer(inElection(tied), { type: 'CLOSE_ELECTION', timestamp: '20:30' });
    expect(closed.currentElection).toMatchObject({ isRunoff: true, floorBallots: {} });
  });
});
