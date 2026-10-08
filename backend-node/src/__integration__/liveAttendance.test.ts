import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import { getStorage, initializeStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { roomManager } from '../socket/roomManager.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { liveSockets, type FakeSocket } from './liveSockets.js';

const live = liveSockets();
const stateOf = async (code: string): Promise<MeetingState> =>
  (await getStorage().getMeeting(code))!.state;

beforeAll(initializeStorage);

describe('attendance in a live meeting', () => {
  let f: Fixture;
  let chair: FakeSocket;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.secretary.id },
    });
    chair = live.connect(f.users.secretary);
    await live.join(chair, f.packet.code);
  });
  afterEach(live.disconnectAll);

  it('marks a person from the roster present, with the role the organization gives them', async () => {
    const res = await live.dispatch(chair, {
      type: 'MARK_PRESENT',
      userId: f.users.owner.id,
      timestamp: '',
    });
    expect(res.success).toBe(true);
    const owner = (await stateOf(f.packet.code)).members.find((m) => m.id === f.users.owner.id);
    expect(owner).toEqual({
      id: f.users.owner.id,
      name: 'A owner',
      role: 'admin',
      present: true,
      presentBy: 'chair',
    });
  });

  it('ignores who a client says the person is', async () => {
    await live.dispatch(chair, {
      type: 'MARK_PRESENT',
      userId: f.users.member.id,
      member: { id: f.users.member.id, name: 'Forged', role: 'chair', present: true },
      timestamp: '',
    });
    const marked = (await stateOf(f.packet.code)).members.find((m) => m.id === f.users.member.id);
    expect(marked).toMatchObject({ name: 'A member', role: 'member' });
  });

  it('refuses to mark present someone outside the roster', async () => {
    const res = await live.dispatch(chair, {
      type: 'MARK_PRESENT',
      userId: f.outsider.id,
      timestamp: '',
    });
    expect(res).toMatchObject({ success: false, errorCode: 'NOT_A_MEMBER' });
  });

  it("refuses a member's MARK_PRESENT", async () => {
    const member = live.connect(f.users.member);
    await live.join(member, f.packet.code);
    const res = await live.dispatch(member, {
      type: 'MARK_PRESENT',
      userId: f.users.owner.id,
      timestamp: '',
    });
    expect(res).toMatchObject({ success: false, errorCode: 'PERMISSION_DENIED' });
  });

  it('marks absent a member present on a device only once the device is gone', async () => {
    const member = live.connect(f.users.member);
    await live.join(member, f.packet.code);
    const markAbsent = () =>
      live.dispatch(chair, {
        type: 'MARK_ABSENT',
        memberId: f.users.member.id,
        excused: false,
        timestamp: '',
      });

    expect(await markAbsent()).toMatchObject({ success: false, errorCode: 'MEMBER_CONNECTED' });

    // The member's phone locks: within its grace period the chair may mark them absent
    live.drop(member);
    expect((await markAbsent()).success).toBe(true);
    const absent = (await stateOf(f.packet.code)).members.find((m) => m.id === f.users.member.id);
    expect(absent?.present).toBe(false);
  });

  it('treats a member whose device becomes a display as gone from that device', async () => {
    const member = live.connect(f.users.member);
    await live.join(member, f.packet.code);
    const markAbsent = () =>
      live.dispatch(chair, {
        type: 'MARK_ABSENT',
        memberId: f.users.member.id,
        excused: false,
        timestamp: '',
      });
    expect(await markAbsent()).toMatchObject({ success: false, errorCode: 'MEMBER_CONNECTED' });

    // The same socket opens the display: it is no longer the member's device
    expect((await live.join(member, f.packet.code, true)).success).toBe(true);
    expect(roomManager.isMemberConnected(f.packet.code, f.users.member.id)).toBe(false);
    expect(roomManager.inGrace(f.packet.code, f.users.member.id)).toBe(true);
    expect((await markAbsent()).success).toBe(true);

    // The display closing changes nothing for the member
    await live.drop(member);
    const after = (await stateOf(f.packet.code)).members.find((m) => m.id === f.users.member.id);
    expect(after?.present).toBe(false);
  });

  it('keeps a member on a connected device present, however they were marked', async () => {
    // Marked present by the chair, then their device connects: still marked by the chair
    await live.dispatch(chair, { type: 'MARK_PRESENT', userId: f.users.owner.id, timestamp: '' });
    const owner = live.connect(f.users.owner);
    await live.join(owner, f.packet.code);
    const before = (await stateOf(f.packet.code)).members.find((m) => m.id === f.users.owner.id);
    expect(before?.presentBy).toBe('chair');

    const res = await live.dispatch(chair, {
      type: 'MARK_ABSENT',
      memberId: f.users.owner.id,
      excused: true,
      timestamp: '',
    });
    expect(res).toMatchObject({ success: false, errorCode: 'MEMBER_CONNECTED' });
  });

  it('leaves a member present on a connected device to their device when the chair marks them', async () => {
    const member = live.connect(f.users.member);
    await live.join(member, f.packet.code);
    const res = await live.dispatch(chair, {
      type: 'MARK_PRESENT',
      userId: f.users.member.id,
      timestamp: '',
    });
    expect(res).toMatchObject({ success: false, errorCode: 'INVALID_STATE' });
    const marked = (await stateOf(f.packet.code)).members.find((m) => m.id === f.users.member.id);
    expect(marked?.presentBy).toBe('device');

    // Their phone locks: within the grace period the chair may mark them present to keep them
    await live.drop(member);
    const again = await live.dispatch(chair, {
      type: 'MARK_PRESENT',
      userId: f.users.member.id,
      timestamp: '',
    });
    expect(again.success).toBe(true);
    const kept = (await stateOf(f.packet.code)).members.find((m) => m.id === f.users.member.id);
    expect(kept?.presentBy).toBe('chair');
  });

  it('marks absent a member the chair marked present', async () => {
    await live.dispatch(chair, { type: 'MARK_PRESENT', userId: f.users.owner.id, timestamp: '' });
    const res = await live.dispatch(chair, {
      type: 'MARK_ABSENT',
      memberId: f.users.owner.id,
      excused: true,
      timestamp: '',
    });
    expect(res.success).toBe(true);
  });

  it('counts the headcount and members marked present toward quorum, never guests', async () => {
    await prisma.organization.update({ where: { id: f.orgA.id }, data: { quorumCount: 4 } });
    await resetLiveMeetings();
    await live.join(chair, f.packet.code);
    const guest = live.connect(f.outsider);
    await live.join(guest, f.packet.code);
    await live.dispatch(chair, { type: 'MARK_PRESENT', userId: f.users.owner.id, timestamp: '' });
    await live.dispatch(chair, {
      type: 'SET_HEADCOUNT',
      count: 2,
      names: ['Dee'],
      timestamp: '',
    });

    const state = await stateOf(f.packet.code);
    expect(state.headcount).toBe(2);
    expect(state.headcountNames).toEqual(['Dee']);

    // More proxies than the organization has voting members (20) can't be held
    const tooMany = await live.dispatch(chair, {
      type: 'SET_HEADCOUNT',
      count: 2,
      names: ['Dee'],
      proxiesHeld: 21,
      timestamp: '',
    });
    expect(tooMany).toMatchObject({ success: false, errorCode: 'INVALID_ACTION' });
    expect(
      (
        await live.dispatch(chair, {
          type: 'SET_HEADCOUNT',
          count: 2,
          names: ['Dee'],
          proxiesHeld: 20,
          timestamp: '',
        })
      ).success,
    ).toBe(true);
    expect(attendanceSummary(state)).toMatchObject({
      devicePresent: 1,
      markedPresent: 1,
      headcount: 2,
      present: 4,
      quorum: 4,
      hasQuorum: true,
      guests: 1,
    });
  });
});
