import { describe, it, expect, vi } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import type { OrgRole } from '../generated/prisma/client.js';
import { ACTOR_FIELDS } from '../socket/actionEnricher.js';
import { validateAction } from '../socket/actionValidator.js';
import { ACTION_TYPES, checkPermission, membersMaySend } from '../socket/permissionGuard.js';

// A stubbed roster: 1 an owner and director, 2 a secretary (not a director), 3 a member and
// director, 4 a member, 5 a viewer
const roster = new Map<
  number,
  { role: OrgRole; name: string | null; email: string; isDirector: boolean }
>([
  [1, { role: 'owner', name: 'Dana', email: 'dana@example.org', isDirector: true }],
  [2, { role: 'secretary', name: 'Pat', email: 'pat@example.org', isDirector: false }],
  [3, { role: 'member', name: 'Alice', email: 'alice@example.org', isDirector: true }],
  [4, { role: 'member', name: 'Ben', email: 'ben@example.org', isDirector: false }],
  [5, { role: 'viewer', name: 'Vic', email: 'vic@example.org', isDirector: false }],
]);
vi.mock('../socket/meetingPacket.js', () => ({
  findOrgPeople: async (_org: string, ids: number[]) =>
    new Map([...roster].filter(([id]) => ids.includes(id))),
  findMeetingPacket: async () => null,
}));

const { deriveMeetingSeat, roleChanges } = await import('../socket/meetingRoles.js');

describe('deriveMeetingSeat in a board meeting', () => {
  const board = { chairUserId: 1, kind: 'board' as const };
  const seat = (orgRole: OrgRole | null, isDirector: boolean, userId = 7) =>
    deriveMeetingSeat(board, { orgRole, isDirector }, userId);

  it('makes directors the members, a secretary or above among them an admin', () => {
    expect(seat('member', true)).toEqual({ role: 'member' });
    expect(seat('secretary', true)).toEqual({ role: 'admin' });
    expect(seat('owner', true)).toEqual({ role: 'admin' });
  });

  it('keeps the console for a secretary or admin who is not a director, without a vote', () => {
    expect(seat('secretary', false)).toEqual({ role: 'admin', nonVoting: true });
    expect(seat('admin', false)).toEqual({ role: 'admin', nonVoting: true });
  });

  it("makes the organization's other people observers, and outsiders guests", () => {
    expect(seat('member', false)).toEqual({ role: 'observer' });
    expect(seat('viewer', false)).toEqual({ role: 'observer' });
    // A viewer marked a director (only members and above can be) doesn't vote
    expect(seat('viewer', true)).toEqual({ role: 'observer' });
    expect(seat(null, false)).toEqual({ role: 'guest' });
  });

  it('makes the presiding officer the chair, without a vote when not a director', () => {
    expect(seat('member', true, 1)).toEqual({ role: 'chair' });
    expect(seat('secretary', false, 1)).toEqual({ role: 'chair', nonVoting: true });
  });

  it('is the members meeting as before when the packet is of the members', () => {
    const members = { chairUserId: 1, kind: 'members' as const };
    expect(deriveMeetingSeat(members, { orgRole: 'member', isDirector: false }, 7)).toEqual({
      role: 'member',
    });
    expect(deriveMeetingSeat(members, { orgRole: 'viewer', isDirector: true }, 7)).toEqual({
      role: 'guest',
    });
  });
});

describe('roleChanges in a board meeting', () => {
  const member = (id: number, name: string, role: Member['role'], nonVoting?: boolean): Member => ({
    id,
    name,
    role,
    present: true,
    ...(nonVoting && { nonVoting }),
  });

  it('lists who no longer has the role or the vote the organization gives them', async () => {
    const changes = await roleChanges({ organizationId: 'org', chairUserId: 1, kind: 'board' }, [
      member(1, 'Dana', 'chair'), // unchanged
      member(2, 'Pat', 'admin'), // not a director: no vote
      member(3, 'Alice', 'member'), // unchanged
      member(4, 'Ben', 'member'), // an observer
      member(5, 'Vic', 'guest'), // an observer
    ]);
    expect(changes).toEqual([
      { id: 2, name: 'Pat', role: 'admin', nonVoting: true },
      { id: 4, name: 'Ben', role: 'observer' },
      { id: 5, name: 'Vic', role: 'observer' },
    ]);
  });
});

describe('observers and the permission guard', () => {
  it('lets an observer send nothing', () => {
    expect(ACTION_TYPES.filter((type) => checkPermission('observer', type))).toEqual([]);
  });

  it('knows which actions are taking part, not presiding', () => {
    expect(membersMaySend('CAST_VOTE')).toBe(true);
    expect(membersMaySend('RAISE_HAND')).toBe(true);
    expect(membersMaySend('OPEN_VOTING')).toBe(false);
    expect(membersMaySend('MAKE_FLOOR_MOTION')).toBe(false);
  });
});

const person = (id: number, role: Member['role'], extra: Partial<Member> = {}): Member => ({
  id,
  name: `Person ${id}`,
  role,
  present: true,
  presentBy: 'device',
  ...extra,
});

/** A board meeting in session: Dana chairs, Alice and Carl are directors, Pat presides without a
 * vote, Ben observes, Sam is a guest */
const boardState: MeetingState = {
  ...initialState,
  meetingActive: true,
  meetingStage: 'new-business',
  agendaAdopted: true,
  kind: 'board',
  board: { directors: 4 },
  quorum: 3,
  members: [
    person(1, 'chair'),
    person(3, 'member'),
    person(6, 'member'),
    person(2, 'admin', { nonVoting: true }),
    person(4, 'observer'),
    person(9, 'guest'),
  ],
};

/** An action as the enricher leaves it, sent by this member */
function from(senderId: number, action: Record<string, unknown>): MeetingAction {
  const actor = ACTOR_FIELDS[action.type as MeetingAction['type']];
  const sent: Record<string, unknown> = { timestamp: '', ...action };
  if (actor.id) sent[actor.id] = senderId;
  if (actor.name) sent[actor.name] = `Person ${senderId}`;
  if (actor.member) sent.member = boardState.members.find((m) => m.id === senderId);
  return sent as unknown as MeetingAction;
}

describe('validating a board meeting', () => {
  const motion = {
    type: 'MAKE_MOTION',
    motionType: 'mainMotion',
    text: 'Hire a gardener',
    motionId: 1,
  };

  it('refuses everything members do from someone who presides without a vote', () => {
    for (const action of [motion, { type: 'RAISE_HAND', stance: 'pro' }]) {
      expect(validateAction(boardState, from(2, action))).toMatchObject({
        valid: false,
        errorCode: 'PERMISSION_DENIED',
      });
    }
    // Presiding is still theirs
    expect(validateAction(boardState, from(2, { type: 'START_ROLL_CALL' }))).toMatchObject({
      valid: true,
    });
  });

  it('refuses an observer the state has, whatever their socket says', () => {
    expect(validateAction(boardState, from(4, motion))).toMatchObject({
      valid: false,
      error: "Observers follow a board meeting but don't take part in it",
      errorCode: 'PERMISSION_DENIED',
    });
    expect(validateAction(boardState, from(3, motion)).valid).toBe(true);
  });

  it('refuses a vote from a director only when voting is closed, never from an observer', () => {
    const voting = { ...boardState, votingOpen: true, currentMotion: null };
    expect(validateAction(voting, from(3, { type: 'CAST_VOTE', vote: 'yea' })).valid).toBe(true);
    expect(validateAction(voting, from(4, { type: 'CAST_VOTE', vote: 'yea' })).valid).toBe(false);
    expect(validateAction(voting, from(2, { type: 'CAST_VOTE', vote: 'yea' })).valid).toBe(false);
  });

  it('records a motion from the floor only for a director', () => {
    const floor = (moverMemberId: number) =>
      validateAction(
        boardState,
        from(1, {
          type: 'MAKE_FLOOR_MOTION',
          motionType: 'mainMotion',
          text: 'Hire a gardener',
          moverName: '',
          moverMemberId,
          motionId: 1,
        }),
      );
    expect(floor(3).valid).toBe(true);
    expect(floor(4)).toMatchObject({
      valid: false,
      error: 'Only the directors make motions in a board meeting',
    });
    expect(floor(2).valid).toBe(false);
  });

  it('refuses the count of the room and proxies', () => {
    expect(
      validateAction(boardState, from(1, { type: 'SET_HEADCOUNT', count: 2, names: [] })),
    ).toMatchObject({ valid: false, errorCode: 'BOARD_MEETING' });
    expect(
      validateAction(boardState, from(1, { type: 'SET_PROXY_SETTINGS', allowProxyVoting: true })),
    ).toMatchObject({ valid: false, errorCode: 'BOARD_MEETING' });
  });

  it('marks present only someone who takes part', () => {
    const mark = (member: Member) =>
      validateAction(boardState, from(1, { type: 'MARK_PRESENT', userId: member.id, member }));
    expect(mark(person(6, 'member', { present: false })).valid).toBe(true);
    expect(mark(person(4, 'observer', { present: false }))).toMatchObject({
      valid: false,
      errorCode: 'BOARD_MEETING',
    });
  });

  it('caps the floor tally at the directors not voting on a device', () => {
    const voting: MeetingState = {
      ...boardState,
      votingOpen: true,
      voters: [3],
      votes: { yea: 1, nay: 0, abstain: 0 },
    };
    const tally = (yea: number, nay = 0) =>
      validateAction(voting, from(1, { type: 'SET_FLOOR_TALLY', yea, nay, abstain: 0 }));
    expect(tally(2, 1).valid).toBe(true);
    expect(tally(3, 1)).toMatchObject({
      valid: false,
      error: 'Only 3 directors are not voting on a device',
      errorCode: 'BOARD_MEETING',
    });
  });

  it('refuses a bylaw amendment', () => {
    expect(
      validateAction(
        boardState,
        from(3, { type: 'MAKE_MOTION', motionType: 'bylawAmendment', text: 'x', motionId: 2 }),
      ),
    ).toMatchObject({ valid: false, errorCode: 'MOTION_NOT_OFFERED' });
  });

  it('changes who votes only before the call to order', () => {
    const setBoard: MeetingAction = {
      type: 'SET_BOARD',
      kind: 'board',
      board: { directors: 5 },
      quorum: 3,
      timestamp: '',
    };
    expect(validateAction({ ...initialState }, setBoard).valid).toBe(true);
    expect(validateAction(boardState, setBoard)).toMatchObject({
      valid: false,
      errorCode: 'MEETING_ALREADY_ACTIVE',
    });
  });
});
