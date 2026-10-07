import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { getStorage, initializeStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { setIoInstance } from '../socket/ioInstance.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { liveSockets } from './liveSockets.js';
import { describeRules } from './rules.js';

const live = liveSockets();
const stateOf = async (code: string): Promise<MeetingState> =>
  (await getStorage().getMeeting(code))!.state;

beforeAll(async () => {
  await initializeStorage();
  // A meeting left called to order (by an earlier file or run) would refuse the agenda reload
  await resetLiveMeetings();
  // Routes send live meetings their new state through the server's socket.io instance
  setIoInstance(live.io as never);
});

describeRules('live schedule rules', [
  {
    method: 'get',
    route: '/packets/:robbieCode/roster',
    path: (f) => `/api/packets/${f.packet.code}/roster`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/packets/:robbieCode/reload-agenda',
    path: (f) => `/api/packets/${f.packet.code}/reload-agenda`,
    min: 'secretary',
    ok: 200,
  },
]);

describe('the roster of a meeting', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it("lists the organization's members with their emails, and pending additions, for an admin", async () => {
    const res = await call('get', `/api/packets/${f.packet.code}/roster`, {
      cookie: f.users.admin.cookie,
    });
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(5);
    expect(res.body.members[0]).toEqual({
      userId: f.users.viewer.id,
      name: 'A viewer',
      email: 'viewer@example.org',
      orgRole: 'viewer',
    });
    expect(res.body.invites).toEqual([{ email: 'pending@example.org', role: 'member' }]);
  });

  it('keeps emails and pending additions to admins', async () => {
    // A secretary chairing the meeting, a member, a viewer
    for (const user of [f.users.secretary, f.users.member, f.users.viewer]) {
      const res = await call('get', `/api/packets/${f.packet.code}/roster`, {
        cookie: user.cookie,
      });
      expect(res.status).toBe(200);
      expect(res.body.members).toHaveLength(5);
      expect(res.body.members[0]).toEqual({
        userId: f.users.viewer.id,
        name: 'A viewer',
        orgRole: 'viewer',
      });
      expect(JSON.stringify(res.body)).not.toContain('@example.org');
      expect(res.body.invites).toEqual([]);
    }
  });
});

describe('reloading the agenda from the schedule', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
  });
  afterEach(live.disconnectAll);

  const reload = (cookie: string) =>
    call('post', `/api/packets/${f.packet.code}/reload-agenda`, { cookie });

  it("has nothing to replace before anyone joins: the first join brings the packet's agenda", async () => {
    const res = await reload(f.users.secretary.cookie);
    expect(res.body).toEqual({
      live: false,
      agenda: [
        { id: 1, title: 'Reports', status: 'pending', packetItemId: f.item },
        { id: 2, title: 'New business', status: 'pending', packetItemId: f.item2 },
      ],
    });
    expect(await getStorage().getMeeting(f.packet.code)).toBeNull();
  });

  it('replaces the live agenda before the meeting starts, and sends the room the change', async () => {
    await live.join(live.connect(f.users.member), f.packet.code);
    await prisma.meetingAgendaItem.update({
      where: { id: f.item2 },
      data: { title: 'Old business' },
    });
    await prisma.meetingAgendaItem.create({
      data: { packetId: f.packet.id, title: 'Adjournment', position: 2 },
    });
    live.broadcasts.length = 0;

    const res = await reload(f.users.secretary.cookie);
    expect(res.status).toBe(200);
    expect(res.body.live).toBe(true);
    const titles = (await stateOf(f.packet.code)).agenda.map((item) => item.title);
    expect(titles).toEqual(['Reports', 'Old business', 'Adjournment']);
    expect(live.broadcasts).toEqual([
      expect.objectContaining({ room: 'meeting:ORGA01', event: 'STATE_UPDATE' }),
    ]);
  });

  it('is refused once the meeting has started', async () => {
    const chair = live.connect(f.users.secretary);
    await live.join(chair, f.packet.code);
    await live.dispatch(chair, { type: 'START_MEETING', timestamp: '' });

    const res = await reload(f.users.secretary.cookie);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'The meeting has started; change the agenda in the meeting',
    });
  });

  it('is open to the presiding officer, whatever their role', async () => {
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.member.id },
    });
    expect((await reload(f.users.member.cookie)).status).toBe(200);
  });
});

describe('changing the presiding officer on the schedule', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
  });
  afterEach(live.disconnectAll);

  it("changes the live meeting's chair at once", async () => {
    const secretary = live.connect(f.users.secretary);
    const member = live.connect(f.users.member);
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.secretary.id },
    });
    await live.join(secretary, f.packet.code);
    await live.join(member, f.packet.code);

    const res = await call('put', `/api/packets/${f.packet.id}`, {
      cookie: f.users.admin.cookie,
      body: { chairUserId: f.users.member.id },
    });
    expect(res.status).toBe(200);
    const roles = (await stateOf(f.packet.code)).members.map((m) => [m.id, m.role]);
    expect(roles).toEqual([
      [f.users.secretary.id, 'admin'],
      [f.users.member.id, 'chair'],
    ]);
    expect(member.data.role).toBe('chair');
    expect(secretary.data.role).toBe('admin');
  });
});

describe("changing the organization's members", () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
  });
  afterEach(live.disconnectAll);

  const roleOf = async (userId: number) =>
    (await stateOf(f.packet.code)).members.find((m) => m.id === userId)?.role;

  it('changes their roles in the live meeting at once, without a rejoin', async () => {
    const member = live.connect(f.users.member);
    const viewer = live.connect(f.users.viewer);
    await live.join(member, f.packet.code);
    await live.join(viewer, f.packet.code);
    expect(await roleOf(f.users.viewer.id)).toBe('guest');

    // Removed from the organization: a guest now
    const removed = await call(
      'delete',
      `/api/organizations/${f.orgA.id}/members/${f.users.member.id}`,
      { cookie: f.users.admin.cookie },
    );
    expect(removed.status).toBe(204);
    expect(await roleOf(f.users.member.id)).toBe('guest');
    expect(member.data.role).toBe('guest');

    // A viewer made a secretary: an admin now
    const promoted = await call(
      'put',
      `/api/organizations/${f.orgA.id}/members/${f.users.viewer.id}`,
      { cookie: f.users.admin.cookie, body: { role: 'secretary' } },
    );
    expect(promoted.status).toBe(200);
    expect(await roleOf(f.users.viewer.id)).toBe('admin');
    expect(viewer.data.role).toBe('admin');

    // Leaving the organization
    const left = await call(
      'delete',
      `/api/organizations/${f.orgA.id}/members/${f.users.viewer.id}`,
      { cookie: f.users.viewer.cookie },
    );
    expect(left.status).toBe(204);
    expect(await roleOf(f.users.viewer.id)).toBe('guest');
  });

  it('leaves an adjourned meeting as it was', async () => {
    const secretary = live.connect(f.users.secretary);
    const member = live.connect(f.users.member);
    await live.join(secretary, f.packet.code);
    await live.join(member, f.packet.code);
    expect((await live.dispatch(secretary, { type: 'START_MEETING', timestamp: '' })).success).toBe(
      true,
    );
    expect((await live.dispatch(secretary, { type: 'END_MEETING', timestamp: '' })).success).toBe(
      true,
    );
    const adjourned = await getStorage().getMeeting(f.packet.code);

    const removed = await call(
      'delete',
      `/api/organizations/${f.orgA.id}/members/${f.users.member.id}`,
      { cookie: f.users.admin.cookie },
    );
    expect(removed.status).toBe(204);
    expect(await getStorage().getMeeting(f.packet.code)).toEqual(adjourned);
    expect(member.data.role).toBe('member');
  });
});
