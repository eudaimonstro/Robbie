import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { pool } from '../db/client.js';
import { getStorage, initializeStorage } from '../db/meetingStorage.js';
import { handleDisconnect } from '../socket/disconnectHandler.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { signIn } from './helpers.js';
import { liveSockets } from './liveSockets.js';

const live = liveSockets();
const stateOf = async (code: string): Promise<MeetingState> =>
  (await getStorage().getMeeting(code))!.state;

// The live meetings table and its storage, as the server starts them
beforeAll(initializeStorage);

describe('joining a live meeting', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
  });
  afterEach(live.disconnectAll);

  it('is refused for a code without a scheduled meeting', async () => {
    const res = await live.join(live.connect(f.users.member), 'NOPE01');
    expect(res).toEqual({
      success: false,
      error: 'No meeting with that code',
      errorCode: 'MEETING_NOT_FOUND',
    });
    expect(await getStorage().getMeeting('NOPE01')).toBeNull();
  });

  it('creates the live meeting from its packet', async () => {
    await prisma.organization.update({
      where: { id: f.orgA.id },
      data: { quorumPercent: 50, quorumCount: null },
    });
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { scheduledFor: new Date('2026-10-20T19:00:00Z') },
    });

    const res = await live.join(live.connect(f.users.member), f.packet.code);
    expect(res.success).toBe(true);
    expect(res.state).toMatchObject({
      meetingCode: 'ORGA01',
      organizationId: f.orgA.id,
      title: 'October meeting',
      scheduledFor: '2026-10-20T19:00:00.000Z',
      // Half of the 4 members with the member role or above
      quorum: 2,
      headcount: 0,
      agenda: [
        { id: 1, title: 'Reports', status: 'pending', packetItemId: f.item },
        { id: 2, title: 'New business', status: 'pending', packetItemId: f.item2 },
      ],
    });
  });

  it('takes a quorum count from the organization', async () => {
    await prisma.organization.update({ where: { id: f.orgA.id }, data: { quorumCount: 29 } });
    const res = await live.join(live.connect(f.users.member), f.packet.code);
    expect(res.state?.quorum).toBe(29);
  });

  it('gives each person the role their organization gives them', async () => {
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.member.id },
    });
    const expected = [
      [f.users.owner, 'admin'],
      [f.users.admin, 'admin'],
      [f.users.secretary, 'admin'],
      [f.users.member, 'chair'],
      [f.users.viewer, 'guest'],
      [f.outsider, 'guest'],
    ] as const;
    for (const [user, role] of expected) {
      const socket = live.connect(user);
      expect((await live.join(socket, f.packet.code)).success).toBe(true);
      expect(socket.data.role, user.email).toBe(role);
    }
    const state = await stateOf(f.packet.code);
    expect(state.members.map((m) => [m.name, m.role, m.presentBy])).toEqual([
      ['A owner', 'admin', 'device'],
      ['A admin', 'admin', 'device'],
      ['A secretary', 'admin', 'device'],
      ['A member', 'chair', 'device'],
      ['A viewer', 'guest', 'device'],
      ['Outsider', 'guest', 'device'],
    ]);
  });

  it('lets a guest in until the meeting adjourns, and members after', async () => {
    const guest = await signIn('guest@example.org', { name: 'A guest' });
    const first = await live.join(live.connect(guest), f.packet.code);
    expect(first.success).toBe(true);
    expect(first.state?.members.find((m) => m.id === guest.id)?.role).toBe('guest');

    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { startedAt: new Date('2026-10-20T19:00:00Z'), endedAt: new Date() },
    });
    const after = await live.join(live.connect(guest), f.packet.code);
    expect(after).toEqual({
      success: false,
      error: 'This meeting has adjourned',
      errorCode: 'MEETING_NOT_ACTIVE',
    });
    // A member still comes back to the record of their meeting
    expect((await live.join(live.connect(f.users.member), f.packet.code)).success).toBe(true);
  });

  it("starts from the packet when the stored meeting is another organization's", async () => {
    // Left by a deleted organization that had this code: its members, business and minutes
    await getStorage().getOrCreateMeeting(f.packet.code, {
      ...initialState,
      meetingCode: f.packet.code,
      organizationId: f.orgB.id,
      title: "B's secrets",
      meetingStage: 'new-business',
      members: [{ id: f.outsider.id, name: 'Outsider', role: 'chair', present: true }],
      minutesFromPreviousMeeting: 'Minutes of another organization',
    });

    const res = await live.join(live.connect(f.users.member), f.packet.code);
    expect(res.success).toBe(true);
    expect(res.state).toMatchObject({
      organizationId: f.orgA.id,
      title: 'October meeting',
      meetingStage: 'not-started',
    });
    expect(res.state?.members.map((m) => m.id)).toEqual([f.users.member.id]);
    const stored = await stateOf(f.packet.code);
    expect(JSON.stringify(stored)).not.toContain('secrets');
    expect(stored.minutesFromPreviousMeeting).not.toBe('Minutes of another organization');
  });

  it('refuses a user who has not set a name', async () => {
    const nameless = await signIn('nameless@example.org');
    await prisma.organizationMember.create({
      data: { organizationId: f.orgA.id, userId: nameless.id, role: 'member' },
    });
    const res = await live.join(live.connect(nameless), f.packet.code);
    expect(res).toEqual({
      success: false,
      error: 'Set your name first',
      errorCode: 'NAME_REQUIRED',
    });
  });

  it("refreshes a returning member's name and role, and the chair the state still shows", async () => {
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.secretary.id },
    });
    const secretary = live.connect(f.users.secretary);
    const member = live.connect(f.users.member);
    const memberTab = live.connect(f.users.member);
    await live.join(secretary, f.packet.code);
    await live.join(member, f.packet.code);
    await live.join(memberTab, f.packet.code);
    // The schedule changes the presiding officer, and the member renames themselves
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.member.id },
    });
    await prisma.user.update({ where: { id: f.users.member.id }, data: { name: 'Dana' } });
    await live.join(member, f.packet.code);

    const state = await stateOf(f.packet.code);
    expect(state.members.map((m) => [m.id, m.role])).toEqual([
      [f.users.secretary.id, 'admin'],
      [f.users.member.id, 'chair'],
    ]);
    expect(state.members.find((m) => m.id === f.users.member.id)?.name).toBe('Dana');
    expect(member.data.role).toBe('chair');
    // The member's other device too
    expect(memberTab.data.role).toBe('chair');
    expect(secretary.data.role).toBe('admin');
  });

  it('opens a display for members of the organization, without adding it to the meeting', async () => {
    const display = live.connect(f.users.viewer);
    const res = await live.join(display, f.packet.code, true);
    expect(res.success).toBe(true);
    expect(res.state?.meetingCode).toBe('ORGA01');
    expect(display.data).toMatchObject({ display: true, meetingCode: 'ORGA01' });
    expect(display.rooms.has('meeting:ORGA01')).toBe(true);
    expect((await stateOf(f.packet.code)).members).toEqual([]);

    const outsider = await live.join(live.connect(f.outsider), f.packet.code, true);
    expect(outsider).toMatchObject({ success: false, errorCode: 'PERMISSION_DENIED' });
  });
});

describe('the chair in a live meeting', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.secretary.id },
    });
  });
  afterEach(live.disconnectAll);

  it('is handed over in the meeting and recorded on the packet', async () => {
    const secretary = live.connect(f.users.secretary);
    const member = live.connect(f.users.member);
    await live.join(secretary, f.packet.code);
    await live.join(member, f.packet.code);

    const res = await live.dispatch(secretary, {
      type: 'SET_MEMBER_ROLE',
      targetMemberId: f.users.member.id,
      newRole: 'chair',
      timestamp: '',
    });
    expect(res.success).toBe(true);

    const packet = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packet.id } });
    expect(packet.chairUserId).toBe(f.users.member.id);
    // The previous chair, a secretary, goes back to admin, not member
    const state = await stateOf(f.packet.code);
    expect(state.members.map((m) => [m.id, m.role])).toEqual([
      [f.users.secretary.id, 'admin'],
      [f.users.member.id, 'chair'],
    ]);
    expect(secretary.data.role).toBe('admin');
    expect(member.data.role).toBe('chair');
    expect(res.stateVersion).toBe((await getStorage().getMeeting(f.packet.code))!.stateVersion);
  });

  it('is handed only to someone present on a device', async () => {
    const secretary = live.connect(f.users.secretary);
    await live.join(secretary, f.packet.code);
    // In the room without a device: marked present by the secretary
    await live.dispatch(secretary, {
      type: 'MARK_PRESENT',
      userId: f.users.member.id,
      timestamp: '',
    });

    const res = await live.dispatch(secretary, {
      type: 'SET_MEMBER_ROLE',
      targetMemberId: f.users.member.id,
      newRole: 'chair',
      timestamp: '',
    });
    expect(res).toMatchObject({
      success: false,
      errorCode: 'NOT_PRESENT',
      error: 'The new chair needs to be present on a device',
    });
    const packet = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packet.id } });
    expect(packet.chairUserId).toBe(f.users.secretary.id);
  });

  it('is the only role handed out in the meeting', async () => {
    const secretary = live.connect(f.users.secretary);
    const member = live.connect(f.users.member);
    await live.join(secretary, f.packet.code);
    await live.join(member, f.packet.code);
    for (const newRole of ['admin', 'member']) {
      const res = await live.dispatch(secretary, {
        type: 'SET_MEMBER_ROLE',
        targetMemberId: f.users.member.id,
        newRole,
        timestamp: '',
      });
      expect(res).toMatchObject({ success: false, errorCode: 'PERMISSION_DENIED' });
    }
  });

  it('calls the meeting to order and adjourns it, and the schedule records when', async () => {
    const secretary = live.connect(f.users.secretary);
    await live.join(secretary, f.packet.code);
    expect((await live.dispatch(secretary, { type: 'START_MEETING', timestamp: '' })).success).toBe(
      true,
    );
    const started = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packet.id } });
    expect(started.startedAt).toBeInstanceOf(Date);
    expect(started.endedAt).toBeNull();

    expect((await live.dispatch(secretary, { type: 'END_MEETING', timestamp: '' })).success).toBe(
      true,
    );
    const ended = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packet.id } });
    expect(ended.startedAt).toEqual(started.startedAt);
    expect(ended.endedAt).toBeInstanceOf(Date);

    // Called to order again after adjourning (by mistake, say): it is no longer over
    expect((await live.dispatch(secretary, { type: 'START_MEETING', timestamp: '' })).success).toBe(
      true,
    );
    const resumed = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packet.id } });
    expect(resumed.startedAt).toEqual(started.startedAt);
    expect(resumed.endedAt).toBeNull();
  });
});

describe('a live meeting after adjournment', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.secretary.id },
    });
  });
  afterEach(live.disconnectAll);

  it('refuses business, but still records who comes and goes, and can be called to order again', async () => {
    const secretary = live.connect(f.users.secretary);
    const member = live.connect(f.users.member);
    await live.join(secretary, f.packet.code);
    await live.join(member, f.packet.code);
    await live.dispatch(secretary, { type: 'START_MEETING', timestamp: '' });
    expect((await live.dispatch(secretary, { type: 'END_MEETING', timestamp: '' })).success).toBe(
      true,
    );

    const adjourned = {
      success: false,
      error: 'The meeting has adjourned',
      errorCode: 'MEETING_NOT_ACTIVE',
    };
    expect(
      await live.dispatch(member, {
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: 'Resurface the pool',
        motionId: 1,
        timestamp: '',
      }),
    ).toEqual(adjourned);
    expect(
      await live.dispatch(secretary, {
        type: 'MARK_PRESENT',
        userId: f.users.owner.id,
        timestamp: '',
      }),
    ).toEqual(adjourned);

    // Someone new arrives
    expect((await live.join(live.connect(f.users.owner), f.packet.code)).success).toBe(true);
    // The member leaves, then comes back with a new role in the organization
    await handleDisconnect(member as never, live.io as never, 'leave');
    const left = (await stateOf(f.packet.code)).members.find((m) => m.id === f.users.member.id);
    expect(left?.present).toBe(false);
    await prisma.organizationMember.update({
      where: {
        organizationId_userId: { organizationId: f.orgA.id, userId: f.users.member.id },
      },
      data: { role: 'secretary' },
    });
    expect((await live.join(member, f.packet.code)).success).toBe(true);

    const state = await stateOf(f.packet.code);
    expect(state.meetingStage).toBe('adjourned');
    expect(state.members.map((m) => [m.id, m.role, m.present])).toEqual([
      [f.users.secretary.id, 'chair', true],
      [f.users.member.id, 'admin', true],
      [f.users.owner.id, 'admin', true],
    ]);

    expect((await live.dispatch(secretary, { type: 'START_MEETING', timestamp: '' })).success).toBe(
      true,
    );
  });
});

describe('a live meeting saved before it had a packet', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.secretary.id, scheduledFor: new Date('2026-10-20T19:00:00Z') },
    });
    await pool.query(
      `INSERT INTO meetings (code, current_state, state_version) VALUES ($1, $2, 3)`,
      [
        f.packet.code,
        JSON.stringify({
          ...initialState,
          meetingCode: f.packet.code,
          organizationId: null,
          title: '',
          scheduledFor: null,
        }),
      ],
    );
  });
  afterEach(live.disconnectAll);

  it('takes its organization, title and date from the packet when someone joins', async () => {
    const res = await live.join(live.connect(f.users.member), f.packet.code);
    expect(res.success).toBe(true);
    expect(await stateOf(f.packet.code)).toMatchObject({
      organizationId: f.orgA.id,
      title: 'October meeting',
      scheduledFor: '2026-10-20T19:00:00.000Z',
    });
  });
});

describe('meeting storage', () => {
  beforeEach(resetLiveMeetings);

  it('fills in the fields a stored meeting was saved without', async () => {
    const { headcount: _h, headcountNames: _n, floorVotes: _f, ...old } = initialState;
    await pool.query(
      `INSERT INTO meetings (code, current_state, state_version) VALUES ('OLD001', $1, 3)`,
      [JSON.stringify({ ...old, meetingCode: 'OLD001' })],
    );
    const meeting = await getStorage().getMeeting('OLD001');
    expect(meeting).toMatchObject({ stateVersion: 3 });
    expect(meeting!.state).toMatchObject({
      meetingCode: 'OLD001',
      headcount: 0,
      headcountNames: [],
      floorVotes: { yea: 0, nay: 0, abstain: 0 },
    });
  });
});
