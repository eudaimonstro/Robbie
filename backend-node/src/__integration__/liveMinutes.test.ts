import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { getStorage, initializeStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { liveSockets, type FakeSocket } from './liveSockets.js';
import { forgetBroadcasts } from '../socket/statePublisher.js';
import { syncMeetingRoles } from '../socket/meetingRoles.js';

const live = liveSockets();
const stateOf = async (code: string): Promise<MeetingState> =>
  (await getStorage().getMeeting(code))!.state;

// The live meetings table and its storage, as the server starts them
beforeAll(initializeStorage);

describe('minutes in a live meeting', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
  });
  afterEach(live.disconnectAll);

  /**
   * A's October meeting (ORGA01, no presiding officer, so the secretary runs it as an admin),
   * with the member and the owner on devices: three present, A's quorum of 3
   */
  async function openMeeting() {
    const secretary = live.connect(f.users.secretary);
    const member = live.connect(f.users.member);
    const owner = live.connect(f.users.owner);
    for (const socket of [secretary, member, owner]) {
      expect((await live.join(socket, f.packet.code)).success).toBe(true);
    }
    return { secretary, member, owner };
  }

  async function act(socket: FakeSocket, action: Record<string, unknown>) {
    const res = await live.dispatch(socket, { timestamp: '', ...action });
    expect(res, JSON.stringify(action)).toMatchObject({ success: true });
  }

  it('are drafted from the record when the meeting adjourns', async () => {
    await prisma.minutes.delete({ where: { id: f.draftMinutes } });
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { location: 'The clubhouse', scheduledFor: new Date('2026-10-21T00:00:00Z') },
    });
    const { secretary, member, owner } = await openMeeting();
    await act(secretary, { type: 'START_MEETING' });
    await act(secretary, { type: 'ADOPT_AGENDA' });
    await act(member, {
      type: 'MAKE_MOTION',
      motionType: 'mainMotion',
      text: 'Resurface the pool',
      mover: '',
      moverId: 0,
      motionId: 0,
    });
    await act(owner, { type: 'SECOND_MOTION', seconder: '' });
    await act(secretary, { type: 'OPEN_VOTING', voteTimerEnd: null });
    await act(member, { type: 'CAST_VOTE', vote: 'yea', voterId: 0 });
    await act(owner, { type: 'CAST_VOTE', vote: 'yea', voterId: 0 });
    await act(secretary, { type: 'SET_FLOOR_TALLY', yea: 9, nay: 2, abstain: 0 });
    await act(secretary, { type: 'CLOSE_VOTING' });
    await act(secretary, { type: 'END_MEETING' });

    const minutes = await prisma.minutes.findUniqueOrThrow({ where: { packetId: f.packet.id } });
    expect(minutes).toMatchObject({
      status: 'draft',
      updatedById: null,
      organizationId: f.orgA.id,
    });
    expect(minutes.body).toContain('## Minutes of the October meeting');
    // The packet's date and place, in the organization's time zone (Chicago)
    expect(minutes.body).toContain('Tuesday, October 20, 2026, at The clubhouse.');
    expect(minutes.body).toContain(
      '**Main motion.** A member moved: "Resurface the pool." Seconded by A owner. Carried, on devices 2 to 0 and in the room 9 to 2: 11 to 2. A quorum was present.',
    );
    expect(minutes.body).toMatch(/The meeting adjourned at \d{1,2}:\d{2} [AP]M\./);
  });

  it("are drafted once: a meeting adjourned again keeps the secretary's text", async () => {
    // The fixture's draft stands for the secretary's edits
    await prisma.minutes.update({
      where: { id: f.draftMinutes },
      data: { body: 'Edited by the secretary' },
    });
    const { secretary } = await openMeeting();
    for (const type of ['START_MEETING', 'END_MEETING', 'START_MEETING', 'END_MEETING']) {
      await act(secretary, { type });
    }
    const all = await prisma.minutes.findMany({ where: { packetId: f.packet.id } });
    expect(all.map((m) => m.body)).toEqual(['Edited by the secretary']);
  });

  it('put the latest published minutes before the meeting, and its approval marks them', async () => {
    const { secretary } = await openMeeting();
    const state = await stateOf(f.packet.code);
    expect(state.previousMinutesId).toBe(f.minutes);
    expect(state.minutesFromPreviousMeeting).toContain('Minutes of the September meeting');

    await act(secretary, { type: 'START_MEETING' });
    await act(secretary, {
      type: 'APPROVE_MINUTES',
      corrections: 'The meeting adjourned at 8:10 PM',
    });

    const approved = await prisma.minutes.findUniqueOrThrow({ where: { id: f.minutes } });
    expect(approved).toMatchObject({
      status: 'approved',
      approvedAtPacketId: f.packet.id,
      corrections: 'The meeting adjourned at 8:10 PM',
    });
    expect(approved.approvedAt).not.toBeNull();
    expect((await stateOf(f.packet.code)).minutesApproval?.corrections).toBe(
      'The meeting adjourned at 8:10 PM',
    );
  });

  it('are read to members, while a guest is told only that minutes are before the meeting', async () => {
    const { secretary } = await openMeeting();
    // A viewer of the organization is a guest in its meetings
    const guest = live.connect(f.users.viewer);
    const joined = await live.join(guest, f.packet.code);
    expect(joined.state?.minutesFromPreviousMeeting).toBe('');
    expect(joined.state?.previousMinutesId).toBe(f.minutes);

    live.broadcasts.length = 0;
    // The room was sent the text when the meeting opened; later updates leave it out while it
    // is the same. Forgotten, the next update carries it again, and is split by role.
    forgetBroadcasts(f.packet.code);
    await act(secretary, { type: 'START_MEETING' });
    const updates = live.broadcasts.filter((b) => b.event === 'STATE_UPDATE');
    const stateIn = (b: (typeof updates)[number]) => (b.payload as { state: MeetingState }).state;
    expect(updates).toHaveLength(2);
    // The room, apart from the guest, gets the text; the guest's socket gets the state without it
    expect(updates[0]).toMatchObject({ room: `meeting:${f.packet.code}`, except: [guest.id] });
    expect(stateIn(updates[0]).minutesFromPreviousMeeting).toContain(
      'Minutes of the September meeting',
    );
    expect(updates[1].room).toBe(guest.id);
    expect(stateIn(updates[1]).minutesFromPreviousMeeting).toBe('');
    expect(stateIn(updates[1]).previousMinutesId).toBe(f.minutes);
  });

  /** The whole states the server sent this socket itself (not the room's updates) */
  const ownUpdates = (socket: FakeSocket) =>
    (socket.emit as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .filter(([event]) => event === 'STATE_UPDATE')
      .map(([, payload]) => payload as { state: MeetingState; baseVersion?: number });

  it('are sent whole to a guest made a member mid-meeting, who never had their text', async () => {
    const { secretary } = await openMeeting();
    const guest = live.connect(f.users.viewer);
    expect((await live.join(guest, f.packet.code)).state?.minutesFromPreviousMeeting).toBe('');
    await act(secretary, { type: 'START_MEETING' });

    // The organization makes the viewer a member; the meeting's roles follow
    await prisma.organizationMember.update({
      where: {
        organizationId_userId: { organizationId: f.orgA.id, userId: f.users.viewer.id },
      },
      data: { role: 'member' },
    });
    await syncMeetingRoles(live.io as never, f.packet.code);

    expect(guest.data.role).toBe('member');
    const [whole] = ownUpdates(guest);
    expect(whole.baseVersion).toBeUndefined();
    expect(whole.state.minutesFromPreviousMeeting).toContain('Minutes of the September meeting');
    expect(whole.state.members.length).toBeGreaterThan(0);
  });

  it('are taken from a member made a guest, who is sent the whole state as a guest', async () => {
    const { secretary, member } = await openMeeting();
    await act(secretary, { type: 'START_MEETING' });

    await prisma.organizationMember.update({
      where: {
        organizationId_userId: { organizationId: f.orgA.id, userId: f.users.member.id },
      },
      data: { role: 'viewer' },
    });
    await syncMeetingRoles(live.io as never, f.packet.code);

    expect(member.data.role).toBe('guest');
    const [whole] = ownUpdates(member);
    expect(whole.baseVersion).toBeUndefined();
    expect(whole.state.minutesFromPreviousMeeting).toBe('');
    expect(whole.state.previousMinutesId).toBe(f.minutes);
    expect(whole.state.members.find((m) => m.id === f.users.member.id)?.role).toBe('guest');
  });

  it('approved as read, they keep no corrections', async () => {
    const { secretary } = await openMeeting();
    await act(secretary, { type: 'START_MEETING' });
    await act(secretary, { type: 'APPROVE_MINUTES' });
    expect(await prisma.minutes.findUniqueOrThrow({ where: { id: f.minutes } })).toMatchObject({
      status: 'approved',
      corrections: null,
    });
  });

  it("never put drafts, approved minutes, another organization's or the meeting's own before it", async () => {
    await prisma.minutes.update({ where: { id: f.minutes }, data: { status: 'approved' } });
    // The meeting's own minutes, even published
    await prisma.minutes.update({ where: { id: f.draftMinutes }, data: { status: 'published' } });
    await prisma.minutes.create({
      data: {
        organizationId: f.orgB.id,
        packetId: f.packetB.id,
        status: 'published',
        body: "Org B's minutes",
      },
    });
    await openMeeting();
    const state = await stateOf(f.packet.code);
    expect(state.previousMinutesId).toBeNull();
    expect(state.minutesFromPreviousMeeting).toBe('');
  });

  it('are put before a meeting not yet called to order once they are published', async () => {
    await prisma.minutes.update({ where: { id: f.minutes }, data: { status: 'draft' } });
    await live.join(live.connect(f.users.member), f.packet.code);
    expect((await stateOf(f.packet.code)).previousMinutesId).toBeNull();

    // Published while the meeting waits: the next person to arrive brings them in
    await prisma.minutes.update({ where: { id: f.minutes }, data: { status: 'published' } });
    await live.join(live.connect(f.users.owner), f.packet.code);
    expect((await stateOf(f.packet.code)).previousMinutesId).toBe(f.minutes);
  });
});
