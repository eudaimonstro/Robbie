import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { getStorage, initializeStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { liveSockets, type FakeSocket } from './liveSockets.js';

const live = liveSockets();
const stateOf = async (code: string): Promise<MeetingState> =>
  (await getStorage().getMeeting(code))!.state;

beforeAll(initializeStorage);

describe('business from the floor in a live meeting', () => {
  let f: Fixture;
  let chair: FakeSocket;
  let member: FakeSocket;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.secretary.id },
    });
    chair = live.connect(f.users.secretary);
    member = live.connect(f.users.member);
    await live.join(chair, f.packet.code);
    await live.join(member, f.packet.code);
    // The owner is in the room without a device
    await live.dispatch(chair, { type: 'MARK_PRESENT', userId: f.users.owner.id, timestamp: '' });
    await live.dispatch(chair, { type: 'START_MEETING', timestamp: '' });
  });
  afterEach(live.disconnectAll);

  it('records a motion and a second made in the room', async () => {
    const moved = await live.dispatch(chair, {
      type: 'MAKE_FLOOR_MOTION',
      motionType: 'mainMotion',
      text: 'Resurface the pool this spring',
      moverName: 'Forged',
      moverMemberId: f.users.owner.id,
      motionId: 1,
      // Forged: the server records who sent it
      recordedBy: f.users.member.id,
      timestamp: '',
    });
    expect(moved.success).toBe(true);
    const awaiting = (await stateOf(f.packet.code)).pendingSecond;
    expect(awaiting).toMatchObject({
      mover: 'A owner',
      moverId: f.users.owner.id,
      fromFloor: true,
      text: 'Resurface the pool this spring',
    });
    // The server generated the motion's id
    expect(awaiting?.id).not.toBe(1);

    const seconded = await live.dispatch(chair, { type: 'SECOND_FROM_FLOOR', timestamp: '' });
    expect(seconded.success).toBe(true);
    const state = await stateOf(f.packet.code);
    expect(state.pendingSecond).toBeNull();
    expect(state.currentMotion).toMatchObject({
      mover: 'A owner',
      secondedBy: 'a member in the room',
      status: 'active',
    });
    expect(state.meetingLog.slice(-2).map((entry) => entry.message)).toEqual([
      'A owner moves from the floor: "Resurface the pool this spring" (Main Motion). Awaiting second.',
      'Seconded from the floor.',
    ]);
  });

  it("refuses a member's floor motion and floor second", async () => {
    const moved = await live.dispatch(member, {
      type: 'MAKE_FLOOR_MOTION',
      motionType: 'mainMotion',
      text: 'Resurface the pool this spring',
      moverName: 'Frank Ruiz',
      motionId: 1,
      timestamp: '',
    });
    expect(moved).toMatchObject({ success: false, errorCode: 'PERMISSION_DENIED' });

    await live.dispatch(member, {
      type: 'MAKE_MOTION',
      motionType: 'mainMotion',
      text: 'Paint the clubhouse',
      mover: '',
      moverId: 0,
      motionId: 1,
      timestamp: '',
    });
    const seconded = await live.dispatch(member, { type: 'SECOND_FROM_FLOOR', timestamp: '' });
    expect(seconded).toMatchObject({ success: false, errorCode: 'PERMISSION_DENIED' });
    // Nor can the chair record the mover seconding their own motion
    const own = await live.dispatch(chair, {
      type: 'SECOND_FROM_FLOOR',
      seconderMemberId: f.users.member.id,
      timestamp: '',
    });
    expect(own).toMatchObject({ success: false, errorCode: 'INVALID_ACTION' });
    expect((await stateOf(f.packet.code)).pendingSecond?.mover).toBe('A member');
  });

  it('records a nomination from the floor, which a member cannot send', async () => {
    await live.dispatch(chair, { type: 'OPEN_NOMINATIONS', position: 'Treasurer', timestamp: '' });
    const nominate = (socket: FakeSocket) =>
      live.dispatch(socket, {
        type: 'NOMINATE',
        position: 'Treasurer',
        nomineeName: 'A owner',
        nomineeId: f.users.owner.id,
        nominatedBy: '',
        nominatorId: 0,
        nominationId: 1,
        fromFloor: true,
        timestamp: '',
      });

    expect(await nominate(member)).toMatchObject({
      success: false,
      errorCode: 'PERMISSION_DENIED',
    });
    expect((await nominate(chair)).success).toBe(true);
    expect((await stateOf(f.packet.code)).nominations).toMatchObject([
      {
        nomineeName: 'A owner',
        nominatedBy: 'From the floor',
        nominatorId: f.users.secretary.id,
        fromFloor: true,
      },
    ]);
  });

  it('records a question the chair puts with no mover, and no second to wait for', async () => {
    const put = await live.dispatch(chair, {
      type: 'MAKE_MOTION',
      motionType: 'mainMotion',
      text: 'Approve: Pool hours',
      mover: 'Chair',
      moverId: f.users.secretary.id,
      motionId: 1,
      putByChair: true,
      timestamp: '',
    });
    expect(put.success).toBe(true);
    const state = await stateOf(f.packet.code);
    expect(state.pendingSecond).toBeNull();
    expect(state.currentMotion).toMatchObject({
      mover: 'Put by the chair',
      moverId: 0,
      putByChair: true,
    });
  });
});
