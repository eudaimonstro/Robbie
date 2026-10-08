import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingAction, MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import { MAX_FLOOR_COUNT, validateAction } from '../socket/actionValidator.js';

const question: Motion = {
  ...MOTIONS.mainMotion,
  id: 1,
  type: 'mainMotion',
  text: 'Resurface the pool',
  mover: 'Member 2',
  moverId: 2,
  secondedBy: 'Member 3',
  status: 'active',
};

const voting: MeetingState = {
  ...initialState,
  meetingActive: true,
  votingOpen: true,
  currentMotion: question,
  motionStack: [question],
  members: [
    { id: 1, name: 'Chair', role: 'chair', present: true, presentBy: 'device' },
    { id: 2, name: 'Member 2', role: 'member', present: true, presentBy: 'device' },
  ],
};

describe('validating floor votes', () => {
  describe('CLOSE_VOTING', () => {
    const close = (state: MeetingState) =>
      validateAction(state, { type: 'CLOSE_VOTING', timestamp: '' });

    it('needs the show of hands entered before a voice vote closes', () => {
      const voice = { ...voting, votingMethod: 'voice' as const };
      expect(close(voice)).toEqual({
        valid: false,
        error: 'Enter the show of hands before closing',
        errorCode: 'VOTING_METHOD',
      });
      expect(close({ ...voice, floorVotes: { yea: 0, nay: 3, abstain: 0 } }).valid).toBe(true);
      // Nobody voting is a result on any other method
      expect(close(voting).valid).toBe(true);
    });
  });

  describe('SET_FLOOR_TALLY after the chair has voted', () => {
    const tally = (state: MeetingState) =>
      validateAction(state, { type: 'SET_FLOOR_TALLY', yea: 2, nay: 0, abstain: 0, timestamp: '' });
    const chairVoted = {
      ...voting,
      votes: { yea: 2, nay: 1, abstain: 0 },
      voters: [2, 1],
      voterChoices: { 2: 'yea' as const, 1: 'nay' as const },
    };

    it("is refused, so the tally can't make the chair's deciding vote decide nothing", () => {
      expect(tally(chairVoted)).toEqual({
        valid: false,
        error: 'The floor tally must be entered before the chair votes',
        errorCode: 'VOTING_METHOD',
      });
      // Members voting is no bar; on a ballot the chair votes like anyone
      expect(tally({ ...chairVoted, voters: [2], voterChoices: { 2: 'yea' } }).valid).toBe(true);
      expect(tally({ ...chairVoted, votingMethod: 'ballot' }).valid).toBe(true);
    });

    it('is taken while the chair voting restriction is suspended, since the chair votes freely', () => {
      const suspension = {
        id: 1,
        rule: 'chair-voting-restriction' as const,
        purpose: '',
        specificAction: '',
        scope: 'meeting-remainder' as const,
        suspendedAt: '',
        motionId: 9,
      };
      expect(tally({ ...chairVoted, suspendedRules: [suspension] }).valid).toBe(true);
    });
  });

  describe('CAST_VOTE', () => {
    it('is refused on a voice vote', () => {
      const result = validateAction(
        { ...voting, votingMethod: 'voice' },
        { type: 'CAST_VOTE', vote: 'yea', voterId: 2 },
      );
      expect(result).toMatchObject({ valid: false, errorCode: 'VOTING_METHOD' });
    });

    it("judges the chair's deciding vote on the device votes and the floor tally together", () => {
      const chairVote: MeetingAction = {
        type: 'CAST_VOTE',
        vote: 'yea',
        voterId: 1,
        isChairDecidingVote: true,
      };
      // On devices 2 to 2 is a tie the chair could break, but the room makes it 5 to 2
      const decided = {
        ...voting,
        votes: { yea: 2, nay: 2, abstain: 0 },
        floorVotes: { yea: 3, nay: 0, abstain: 0 },
      };
      expect(validateAction(decided, chairVote).errorCode).toBe('CHAIR_CANNOT_VOTE');
      // On devices 4 to 2 the chair has no say, but with the room it is 4 to 4
      const tied = {
        ...voting,
        votes: { yea: 4, nay: 2, abstain: 0 },
        floorVotes: { yea: 0, nay: 2, abstain: 0 },
      };
      expect(validateAction(tied, chairVote).valid).toBe(true);
    });
  });

  describe('CAST_PROXY_VOTE', () => {
    it('is refused on a voice vote', () => {
      const state = {
        ...voting,
        votingMethod: 'voice' as const,
        allowProxyVoting: true,
        proxies: [
          {
            id: 1,
            grantedBy: 3,
            grantedTo: 2,
            grantedByName: 'Member 3',
            grantedToName: 'Member 2',
            grantedAt: '20:00',
            scope: 'all' as const,
          },
        ],
      };
      const result = validateAction(state, {
        type: 'CAST_PROXY_VOTE',
        vote: 'yea',
        forMemberId: 3,
        castById: 2,
        timestamp: '',
      });
      expect(result).toMatchObject({ valid: false, errorCode: 'VOTING_METHOD' });
    });
  });

  describe('SET_FLOOR_TALLY', () => {
    const tally = (counts: Record<string, unknown>, state = voting) =>
      validateAction(state, {
        type: 'SET_FLOOR_TALLY',
        yea: 0,
        nay: 0,
        abstain: 0,
        timestamp: '',
        ...counts,
      } as MeetingAction);

    it('takes whole numbers from 0 while a vote is open', () => {
      expect(tally({ yea: 9, nay: 2, abstain: 1 }).valid).toBe(true);
      expect(tally({ yea: MAX_FLOOR_COUNT }).valid).toBe(true);
      expect(tally({ yea: 1 }, { ...voting, votingOpen: false })).toMatchObject({
        valid: false,
        errorCode: 'VOTING_NOT_OPEN',
      });
    });

    it.each([
      { yea: -1 },
      { nay: 1.5 },
      { abstain: '2' },
      { yea: MAX_FLOOR_COUNT + 1 },
      { yea: null },
    ])('refuses %j', (counts) => {
      expect(tally(counts)).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
    });
  });

  describe('SET_FLOOR_BALLOTS', () => {
    const electing: MeetingState = {
      ...initialState,
      currentElection: {
        id: 1,
        position: 'Director',
        candidates: [{ name: 'Ann', id: 2 }],
        requiredVotes: 'majority',
        votingInProgress: true,
        ballotResults: { Ann: 0 },
        votersWhoVoted: [],
        floorBallots: {},
        elected: null,
      },
    };
    const ballots = (counts: unknown, state = electing) =>
      validateAction(state, { type: 'SET_FLOOR_BALLOTS', counts, timestamp: '' } as MeetingAction);

    it('takes a count for each candidate, written in or not, while ballots are open', () => {
      expect(ballots({ Ann: 6, 'Write-in Name': 1 }).valid).toBe(true);
      expect(ballots({ Ann: 1 }, initialState)).toMatchObject({
        valid: false,
        errorCode: 'NO_ELECTION',
      });
      const closed = {
        ...electing,
        currentElection: { ...electing.currentElection!, votingInProgress: false },
      };
      expect(ballots({ Ann: 1 }, closed).errorCode).toBe('ELECTION_VOTING_NOT_OPEN');
    });

    it.each([[{ Ann: -1 }], [{ Ann: 1.5 }], [{ ' ': 1 }], [[1]], [null], ['Ann']])(
      'refuses %j',
      (counts) => {
        expect(ballots(counts)).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
      },
    );
  });

  describe('SET_VOTING_METHOD', () => {
    it('takes a known method, and not while a vote is open', () => {
      const closed = { ...voting, votingOpen: false };
      expect(validateAction(closed, { type: 'SET_VOTING_METHOD', method: 'voice' }).valid).toBe(
        true,
      );
      expect(
        validateAction(closed, { type: 'SET_VOTING_METHOD', method: 'show-of-hands' } as never),
      ).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
      expect(validateAction(voting, { type: 'SET_VOTING_METHOD', method: 'ballot' })).toMatchObject(
        { valid: false, errorCode: 'VOTING_IN_PROGRESS' },
      );
    });
  });

  describe('a motion to reconsider', () => {
    it("is refused: Robbie doesn't offer reconsider", () => {
      const record = {
        id: 5,
        type: 'mainMotion',
        name: 'Main Motion',
        text: 'Paint the clubhouse',
        passed: true,
        voterChoices: {},
        timestamp: '20:15',
        reconsidered: false,
        reconsiderable: true,
      };
      const result = validateAction(
        { ...initialState, meetingActive: true, agendaAdopted: true, completedMotions: [record] },
        {
          type: 'MAKE_MOTION',
          motionType: 'reconsider',
          text: 'Reconsider the vote on painting the clubhouse',
          mover: 'Member 2',
          moverId: 2,
          motionId: 9,
          reconsideredMotionId: 5,
          timestamp: '',
        },
      );
      expect(result).toMatchObject({ valid: false, errorCode: 'MOTION_NOT_OFFERED' });
    });
  });
});
