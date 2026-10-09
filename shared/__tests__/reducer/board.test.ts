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

describe('START_ROLL_CALL in a board meeting', () => {
  it('calls only the members who take part', () => {
    const state: MeetingState = {
      ...initialState,
      meetingActive: true,
      meetingStage: 'call-to-order',
      kind: 'board',
      board: { directors: 2 },
      members: [
        member(1, 'member'),
        member(2, 'observer'),
        member(3, 'admin', { nonVoting: true }),
        member(4, 'guest'),
      ],
    };
    const called = meetingReducer(state, { type: 'START_ROLL_CALL', timestamp: '10:00' });
    expect(called.rollCall?.responses.map((r) => r.memberId)).toEqual([1]);
  });
});
