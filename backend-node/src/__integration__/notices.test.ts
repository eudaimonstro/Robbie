import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { capturePlainEmailsForTests, type PlainEmail } from '../auth/emailService.js';
import {
  COURTESY_FOOTER,
  NOTICE_AFTER_MEETING,
  NOTICE_LIMIT,
  NOTICE_WITHOUT_DATE,
  setNoticeBatchPause,
} from '../bylawyer/services/meetingNotice.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('notice rules', [
  {
    method: 'get',
    route: '/packets/:robbieCode/notice',
    path: (f) => `/api/packets/${f.packet.code}/notice`,
    min: 'secretary',
    ok: 200,
  },
  {
    // The fixture's meeting has no date: the rule lets the secretary through, and the route
    // refuses to send a notice without one
    method: 'post',
    route: '/packets/:robbieCode/notice',
    path: (f) => `/api/packets/${f.packet.code}/notice`,
    body: () => ({}),
    min: 'secretary',
    ok: 409,
  },
]);

describe('the meeting notice', () => {
  let f: Fixture;
  let outbox: PlainEmail[];
  const failing = new Set<string>();
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
    failing.clear();
    outbox = capturePlainEmailsForTests((to) => failing.has(to));
    setNoticeBatchPause(0);
    // A's October meeting, on Tuesday evening in Chicago, at the clubhouse
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { scheduledFor: new Date('2026-10-21T00:00:00Z'), location: 'The clubhouse' },
    });
  });
  afterEach(() => setNoticeBatchPause(1000));

  const path = () => `/api/packets/${f.packet.code}/notice`;
  const send = (body: object = {}, cookie = f.users.secretary.cookie) =>
    call('post', path(), { cookie, body });

  it('previews the email as the secretary would send it', async () => {
    const res = await call('get', path(), { cookie: f.users.secretary.cookie });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      code: 'ORGA01',
      organization: 'Org A',
      title: 'October meeting',
      kind: 'members',
      when: 'Tuesday, October 20, 2026, at 7:00 PM CDT',
      location: 'The clubhouse',
      agenda: [
        { title: 'Reports', attachments: [] },
        { title: 'New business', attachments: [] },
      ],
      attachments: ['Minutes', 'Bylaws'],
      link: 'http://localhost:5173/meetings/ORGA01',
      footer: COURTESY_FOOTER,
      subject: 'Meeting notice from "Org A": Tuesday, October 20',
      // The five members and the pending addition
      recipients: 6,
      noticeSentAt: null,
      noticeSentBy: null,
      sentToday: 0,
      limit: 3,
      sendable: true,
      reason: null,
    });
    const text: string = res.body.text;
    expect(text).toContain('"Org A" will hold a meeting of its members:');
    expect(text).toContain('When: Tuesday, October 20, 2026, at 7:00 PM CDT');
    expect(text).toContain('Where: The clubhouse');
    expect(text).toContain('1. Reports\n2. New business');
    expect(text).toContain('Documents: Minutes, Bylaws');
    expect(text).toContain('http://localhost:5173/meetings/ORGA01');
    expect(text).toContain('Sign in before the meeting so your phone is ready.');
    expect(text).toContain('Sent by "A secretary" (secretary@example.org) for "Org A".');
    expect(text).toContain(COURTESY_FOOTER);
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it('sends it to every member and pending addition once, and records it', async () => {
    // A member of two organizations, and an addition of someone already a member, get one each
    await prisma.organizationInvite.create({
      data: { organizationId: f.orgA.id, email: 'member@example.org', role: 'member' },
    });
    const res = await send();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sent: 6, failed: 0 });
    expect(outbox.map((m) => m.to).sort()).toEqual([
      'admin@example.org',
      'member@example.org',
      'owner@example.org',
      'pending@example.org',
      'secretary@example.org',
      'viewer@example.org',
    ]);
    expect(outbox[0].subject).toBe('Meeting notice from "Org A": Tuesday, October 20');
    expect(outbox.every((m) => m.text === outbox[0].text)).toBe(true);

    const packet = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packet.id } });
    expect(packet.noticeSentAt).not.toBeNull();
    expect(packet.noticeSentById).toBe(f.users.secretary.id);
    expect(await prisma.meetingNotice.findMany({ where: { packetId: f.packet.id } })).toEqual([
      expect.objectContaining({ recipients: 6, failed: 0, sentById: f.users.secretary.id }),
    ]);

    const preview = await call('get', path(), { cookie: f.users.secretary.cookie });
    expect(preview.body).toMatchObject({ noticeSentBy: 'A secretary', sentToday: 1 });
  });

  it('leaves out suspended accounts, members or added', async () => {
    await prisma.user.update({
      where: { id: f.users.viewer.id },
      data: { suspendedAt: new Date() },
    });
    await prisma.user.create({
      data: { email: 'pending@example.org', suspendedAt: new Date() },
    });
    const res = await send();
    expect(res.body).toMatchObject({ sent: 4, failed: 0 });
    expect(outbox.map((m) => m.to)).not.toContain('viewer@example.org');
    expect(outbox.map((m) => m.to)).not.toContain('pending@example.org');
  });

  it('counts the emails that fail, and sends the rest in batches', async () => {
    for (let i = 0; i < 60; i++) {
      await prisma.organizationInvite.create({
        data: { organizationId: f.orgA.id, email: `owner${i}@example.org`, role: 'member' },
      });
    }
    failing.add('owner7@example.org');
    failing.add('viewer@example.org');
    const res = await send();
    expect(res.body).toMatchObject({ sent: 64, failed: 2 });
    expect(outbox).toHaveLength(64);
    const record = await prisma.meetingNotice.findFirstOrThrow({
      where: { packetId: f.packet.id },
    });
    expect(record).toMatchObject({ recipients: 66, failed: 2 });
  });

  it('asks before sending it again', async () => {
    expect((await send()).status).toBe(200);
    const again = await send();
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NOTICE_SENT_BEFORE');
    expect(again.body.error).toMatch(/^The notice was sent on .+\. Send it again\?$/);
    expect(outbox).toHaveLength(6);
    expect((await send({ confirmResend: true })).status).toBe(200);
    expect(outbox).toHaveLength(12);
  });

  it('is limited to 3 a day for an organization', async () => {
    const other = await prisma.meetingPacket.create({
      data: {
        organizationId: f.orgA.id,
        robbieCode: 'ORGA03',
        scheduledFor: new Date('2026-11-01T00:00:00Z'),
      },
    });
    await prisma.meetingNotice.createMany({
      data: [1, 2].map(() => ({ organizationId: f.orgA.id, packetId: other.id, recipients: 6 })),
    });
    // Notices of another organization don't count
    await prisma.meetingNotice.create({
      data: { organizationId: f.orgB.id, packetId: f.packetB.id, recipients: 1 },
    });
    expect((await send()).status).toBe(200);
    const res = await call('post', '/api/packets/ORGA03/notice', {
      cookie: f.users.secretary.cookie,
      body: {},
    });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe(NOTICE_LIMIT);
    // A day later it can go
    await prisma.meetingNotice.updateMany({
      where: { organizationId: f.orgA.id },
      data: { sentAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    expect(
      (
        await call('post', '/api/packets/ORGA03/notice', {
          cookie: f.users.secretary.cookie,
          body: {},
        })
      ).status,
    ).toBe(200);
  });

  it('is refused for a meeting called to order or without a date', async () => {
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { scheduledFor: null },
    });
    let res = await send();
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(NOTICE_WITHOUT_DATE);
    const preview = await call('get', path(), { cookie: f.users.secretary.cookie });
    expect(preview.body).toMatchObject({ sendable: false, reason: NOTICE_WITHOUT_DATE });

    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { scheduledFor: new Date('2026-10-21T00:00:00Z'), startedAt: new Date() },
    });
    res = await send();
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(NOTICE_AFTER_MEETING);
    expect(outbox).toHaveLength(0);
  });

  it("says a board meeting's members may observe it", async () => {
    await prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId: f.orgA.id, userId: f.users.owner.id } },
      data: { isDirector: true },
    });
    await prisma.meetingPacket.update({ where: { id: f.packet.id }, data: { kind: 'board' } });
    const res = await send();
    expect(res.body.sent).toBe(6);
    expect(outbox[0].subject).toBe('Board meeting notice from "Org A": Tuesday, October 20');
    expect(outbox[0].text).toContain('"Org A" will hold a meeting of its Board of Directors:');
    expect(outbox[0].text).toContain('As a member you may attend and observe');
    expect(outbox[0].text).not.toContain('No phone?');
  });
});
