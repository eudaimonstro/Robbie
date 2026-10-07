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
