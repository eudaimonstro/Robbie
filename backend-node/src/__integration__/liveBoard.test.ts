import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { getStorage, initializeStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { syncMeetingRoles } from '../socket/meetingRoles.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { liveSockets, type FakeSocket } from './liveSockets.js';

const live = liveSockets();
const stateOf = async (code: string): Promise<MeetingState> =>
  (await getStorage().getMeeting(code))!.state;

// The live meetings table and its storage, as the server starts them
beforeAll(initializeStorage);

describe('a board meeting', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
    // A's October meeting is the board's, with the owner presiding; the owner, the member and
    // the admin are its directors
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { kind: 'board', chairUserId: f.users.owner.id },
    });
    await prisma.organizationMember.updateMany({
      where: {
        organizationId: f.orgA.id,
        userId: { in: [f.users.owner.id, f.users.member.id, f.users.admin.id] },
      },
      data: { isDirector: true },
    });
  });
  afterEach(live.disconnectAll);

  async function act(socket: FakeSocket, action: Record<string, unknown>) {
    const res = await live.dispatch(socket, { timestamp: '', ...action });
    expect(res, JSON.stringify(action)).toMatchObject({ success: true });
    return res;
  }

  it('seats the directors to vote, keeps the console for the secretary and makes members observers', async () => {
    const expected = [
      [f.users.owner, 'chair', undefined],
      [f.users.admin, 'admin', undefined],
      [f.users.secretary, 'admin', true],
      [f.users.member, 'member', undefined],
      [f.users.viewer, 'observer', undefined],
      [f.outsider, 'guest', undefined],
    ] as const;
    for (const [user] of expected) {
      expect((await live.join(live.connect(user), f.packet.code)).success, user.email).toBe(true);
    }
    const state = await stateOf(f.packet.code);
    expect(state.kind).toBe('board');
    // Three directors: a majority is 2
    expect(state.board).toEqual({ directors: 3 });
    expect(state.quorum).toBe(2);
    // The members' September minutes are theirs to approve, not the board's
    expect(state.previousMinutesId).toBeNull();
    for (const [user, role, nonVoting] of expected) {
      const member = state.members.find((m) => m.id === user.id);
      expect(member?.role, user.email).toBe(role);
      expect(member?.nonVoting, user.email).toBe(nonVoting);
    }
  });

  it("takes the organization's board quorum, and follows the directors until the call to order", async () => {
    await prisma.organization.update({ where: { id: f.orgA.id }, data: { boardQuorum: 3 } });
    const owner = live.connect(f.users.owner);
    await live.join(owner, f.packet.code);
    expect((await stateOf(f.packet.code)).quorum).toBe(3);

    // The secretary is made a director: one more, and a vote for the secretary
    const secretary = live.connect(f.users.secretary);
    await live.join(secretary, f.packet.code);
    await prisma.organizationMember.update({
      where: {
        organizationId_userId: { organizationId: f.orgA.id, userId: f.users.secretary.id },
      },
      data: { isDirector: true },
    });
    await syncMeetingRoles(live.io as never, f.packet.code);
    let state = await stateOf(f.packet.code);
    expect(state.board).toEqual({ directors: 4 });
    expect(state.members.find((m) => m.id === f.users.secretary.id)?.nonVoting).toBeUndefined();

    // After the call to order the board is the record of who could vote
    await act(owner, { type: 'START_MEETING' });
    await prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId: f.orgA.id, userId: f.users.admin.id } },
      data: { isDirector: false },
    });
    await syncMeetingRoles(live.io as never, f.packet.code);
    state = await stateOf(f.packet.code);
    expect(state.board).toEqual({ directors: 4 });
  });

  it('becomes a meeting of the members again when the schedule says so before the call to order', async () => {
    await live.join(live.connect(f.users.member), f.packet.code);
    await prisma.meetingPacket.update({ where: { id: f.packet.id }, data: { kind: 'members' } });
    const viewer = live.connect(f.users.viewer);
    await live.join(viewer, f.packet.code);
    const state = await stateOf(f.packet.code);
    expect(state.kind).toBe('members');
    expect(state.board).toBeNull();
    // A's quorum count of 3 again, and a viewer is a guest
    expect(state.quorum).toBe(3);
    expect(viewer.data.role).toBe('guest');
  });

  it("won't open without directors", async () => {
    await prisma.organizationMember.updateMany({
      where: { organizationId: f.orgA.id },
      data: { isDirector: false },
    });
    expect(await live.join(live.connect(f.users.member), f.packet.code)).toEqual({
      success: false,
      error:
        "This board meeting can't open: the organization has no board members. An admin marks them in Settings, Members.",
      errorCode: 'NO_DIRECTORS',
    });
    expect(await getStorage().getMeeting(f.packet.code)).toBeNull();
  });

  it('decides a motion by the directors, with the observers and the secretary looking on', async () => {
    // The minutes are drafted at the adjournment (the fixture's draft would be kept)
    await prisma.minutes.delete({ where: { id: f.draftMinutes } });
    const owner = live.connect(f.users.owner);
    const member = live.connect(f.users.member);
    const admin = live.connect(f.users.admin);
    const secretary = live.connect(f.users.secretary);
    const viewer = live.connect(f.users.viewer);
    for (const socket of [owner, member, admin, secretary, viewer]) {
      expect((await live.join(socket, f.packet.code)).success).toBe(true);
    }
    await act(owner, { type: 'START_MEETING' });
    await act(owner, { type: 'ADOPT_AGENDA' });

    const motion = {
      type: 'MAKE_MOTION',
      motionType: 'mainMotion',
      text: 'Hire a gardener',
      mover: '',
      moverId: 0,
      motionId: 0,
    };
    // An observer and the secretary without a vote can't move it
    expect(await live.dispatch(viewer, { timestamp: '', ...motion })).toMatchObject({
      success: false,
      errorCode: 'PERMISSION_DENIED',
    });
    expect(await live.dispatch(secretary, { timestamp: '', ...motion })).toMatchObject({
      success: false,
      errorCode: 'PERMISSION_DENIED',
    });
    // Nor ask for the floor
    expect(
      await live.dispatch(viewer, { type: 'RAISE_HAND', stance: 'pro', timestamp: '' }),
    ).toMatchObject({ success: false, errorCode: 'PERMISSION_DENIED' });
    // The members amend the bylaws, not the board
    expect(
      await live.dispatch(member, {
        ...motion,
        motionType: 'bylawAmendment',
        timestamp: '',
        bylawAmendment: { documentId: f.doc, changeType: 'modify', targetSectionId: f.section },
      }),
    ).toMatchObject({ success: false, errorCode: 'MOTION_NOT_OFFERED' });
    // Nobody is counted in the room
    expect(
      await live.dispatch(secretary, { type: 'SET_HEADCOUNT', count: 4, names: [], timestamp: '' }),
    ).toMatchObject({ success: false, errorCode: 'BOARD_MEETING' });

    await act(member, motion);
    await act(admin, { type: 'SECOND_MOTION', seconder: '' });
    await act(owner, { type: 'OPEN_VOTING', voteTimerEnd: null });
    await act(member, { type: 'CAST_VOTE', vote: 'yea', voterId: 0 });
    expect(
      await live.dispatch(viewer, { type: 'CAST_VOTE', vote: 'yea', voterId: 0, timestamp: '' }),
    ).toMatchObject({ success: false, errorCode: 'PERMISSION_DENIED' });
    expect(
      await live.dispatch(secretary, {
        type: 'CAST_VOTE',
        vote: 'yea',
        voterId: 0,
        timestamp: '',
      }),
    ).toMatchObject({ success: false, errorCode: 'PERMISSION_DENIED' });
    // Two directors haven't voted on a device: no more hands than that
    expect(
      await live.dispatch(owner, {
        type: 'SET_FLOOR_TALLY',
        yea: 3,
        nay: 0,
        abstain: 0,
        timestamp: '',
      }),
    ).toMatchObject({ success: false, errorCode: 'BOARD_MEETING' });
    await act(owner, { type: 'SET_FLOOR_TALLY', yea: 1, nay: 0, abstain: 0 });
    await act(owner, { type: 'CLOSE_VOTING' });
    await act(owner, { type: 'END_MEETING' });

    const state = await stateOf(f.packet.code);
    expect(state.completedMotions.at(-1)).toMatchObject({ text: 'Hire a gardener', passed: true });
    const minutes = await prisma.minutes.findUniqueOrThrow({ where: { packetId: f.packet.id } });
    expect(minutes.body).toContain('## Minutes of the meeting of the Board of Directors');
    expect(minutes.body).toContain('**Directors present (3):** A admin, A member, A owner.');
    expect(minutes.body).toContain('**Also present:** A secretary, A viewer.');
    expect(minutes.body).toContain(
      'A quorum of the board (2 of the 3 directors) was present at the call to order.',
    );
    expect(minutes.body).not.toContain('Directors absent');
  });
});
