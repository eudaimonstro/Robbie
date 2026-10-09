import { describe, it, expect } from 'vitest';
import { initialState, meetingReducer } from '../../reducer/index.js';
import type { MeetingState, Member } from '../../types/index.js';

const member = (id: number, role: Member['role'], extra: Partial<Member> = {}): Member => ({
  id,
  name: `Person ${id}`,
  role,
  present: true,
  presentBy: 'device',
  ...extra,
});

describe('SET_BOARD', () => {
  it('makes the meeting the board, with its directors and quorum', () => {
    const state = meetingReducer(initialState, {
      type: 'SET_BOARD',
      kind: 'board',
      board: { directors: 5 },
      quorum: 3,
      timestamp: '10:00',
    });
    expect(state.kind).toBe('board');
    expect(state.board).toEqual({ directors: 5 });
    expect(state.quorum).toBe(3);
  });

  it('makes it a meeting of the members again', () => {
    const board: MeetingState = { ...initialState, kind: 'board', board: { directors: 5 } };
    const state = meetingReducer(board, {
      type: 'SET_BOARD',
      kind: 'members',
      board: null,
      quorum: 29,
      timestamp: '10:00',
    });
    expect(state.kind).toBe('members');
    expect(state.board).toBeNull();
    expect(state.quorum).toBe(29);
  });
});

describe('REFRESH_MEMBERS in a board meeting', () => {
  it('gives and takes away the vote of a presiding officer', () => {
    const state: MeetingState = {
      ...initialState,
      kind: 'board',
      board: { directors: 3 },
      members: [member(1, 'admin'), member(2, 'observer')],
    };
    const refreshed = meetingReducer(state, {
      type: 'REFRESH_MEMBERS',
      members: [
        { id: 1, name: 'Person 1', role: 'admin', nonVoting: true },
        { id: 2, name: 'Person 2', role: 'member' },
      ],
      timestamp: '10:00',
    });
    expect(refreshed.members[0]).toMatchObject({ role: 'admin', nonVoting: true });
    expect(refreshed.members[1].role).toBe('member');
    expect(refreshed.members[1].nonVoting).toBeUndefined();

    const back = meetingReducer(refreshed, {
      type: 'REFRESH_MEMBERS',
      members: [{ id: 1, name: 'Person 1', role: 'admin' }],
      timestamp: '10:01',
    });
    expect(back.members[0].nonVoting).toBeUndefined();
  });
});

describe('the chair of a small board (RONR 49:21)', () => {
  const voting = (directors: number): MeetingState => ({
    ...initialState,
    meetingActive: true,
    kind: 'board',
    board: { directors },
    votingOpen: true,
    members: [member(1, 'chair'), member(2, 'member')],
  });

  it('votes on every question like any director, with twelve directors or fewer', () => {
    const state = meetingReducer(voting(5), {
      type: 'CAST_VOTE',
      vote: 'yea',
      voterId: 1,
      timestamp: '',
    });
    expect(state.votes.yea).toBe(1);
    expect(state.voters).toEqual([1]);
  });

  it('votes only to decide on a larger board, as at a meeting of the members', () => {
    const state = meetingReducer(voting(13), {
      type: 'CAST_VOTE',
      vote: 'yea',
      voterId: 1,
      timestamp: '',
    });
    expect(state.voters).toEqual([]);
  });
});
