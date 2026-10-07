import fs from 'fs';
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { CHAIR_NOT_MEMBER, packetsRouter } from '../bylawyer/routes/packets.js';
import { getFullPath, storeFile } from '../bylawyer/services/fileStorage.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call, runHandler } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('packet rules', [
  {
    method: 'get',
    route: '/organizations/:orgId/packets',
    path: (f) => `/api/organizations/${f.orgA.id}/packets`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/organizations/:orgId/packets',
    path: (f) => `/api/organizations/${f.orgA.id}/packets`,
    body: () => ({ robbieCode: 'NEW001', title: 'November meeting' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/packets/:robbieCode',
    path: (f) => `/api/packets/${f.packet.code}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/packets/:id',
    path: (f) => `/api/packets/${f.packet.id}`,
    body: () => ({ title: 'Annual meeting' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/packets/:id',
    path: (f) => `/api/packets/${f.packet.id}`,
    min: 'secretary',
    ok: 204,
  },
  {
    method: 'get',
    route: '/packets/:id/summary',
    path: (f) => `/api/packets/${f.packet.id}/summary`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('packets', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('are created in an organization', async () => {
    const res = await call('post', `/api/organizations/${f.orgA.id}/packets`, {
      cookie: f.users.secretary.cookie,
      body: { robbieCode: 'NEW001', scheduledFor: '2026-11-05' },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      robbieCode: 'NEW001',
      organizationId: f.orgA.id,
      agendaItems: [],
      attachments: [],
    });
  });

  it('take meeting codes in the live meeting format, in upper case', async () => {
    const cookie = f.users.secretary.cookie;
    const path = `/api/organizations/${f.orgA.id}/packets`;
    const created = await call('post', path, { cookie, body: { robbieCode: ' new001 ' } });
    expect(created.status).toBe(201);
    expect(created.body.robbieCode).toBe('NEW001');

    // The rule looks up the normalized code
    const read = await call('get', '/api/packets/orga01', { cookie: f.users.viewer.cookie });
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ id: f.packet.id, robbieCode: 'ORGA01' });

    for (const robbieCode of ['ABCDEFGHI', 'AB-C01', 'AB_C01', 'ABC']) {
      const res = await call('post', path, { cookie, body: { robbieCode } });
      expect(res.status, robbieCode).toBe(400);
      expect(res.body.error.details).toEqual([
        { path: 'robbieCode', message: 'Meeting code must be 4-8 letters or digits' },
      ]);
    }
    expect((await call('get', '/api/packets/AB-C01', { cookie })).status).toBe(400);
  });

  it('need an unused meeting code', async () => {
    for (const robbieCode of [f.packet.code, f.packetB.code]) {
      const res = await call('post', `/api/organizations/${f.orgA.id}/packets`, {
        cookie: f.users.secretary.cookie,
        body: { robbieCode },
      });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'That meeting code is already in use' });
    }
    const packetB = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packetB.id } });
    expect(packetB.organizationId).toBe(f.orgB.id);
  });

  it("take their agenda's and attachments' files with them when deleted", async () => {
    const stored = await storeFile(f.packet.code, 'report.txt', 'text/plain', Buffer.from('R'));
    if (!stored.success) throw new Error(stored.error);
    await prisma.attachment.create({
      data: {
        type: 'uploaded_file',
        storagePath: stored.file.storagePath,
        displayName: 'Report',
        agendaItemId: f.item,
      },
    });
    const upload = await prisma.attachment.findUniqueOrThrow({ where: { id: f.upload } });
    const files = [upload.storagePath!, stored.file.storagePath].map(getFullPath);
    expect(files.map((file) => fs.existsSync(file))).toEqual([true, true]);

    const res = await call('delete', `/api/packets/${f.packet.id}`, {
      cookie: f.users.secretary.cookie,
    });
    expect(res.status).toBe(204);
    expect(files.map((file) => fs.existsSync(file))).toEqual([false, false]);
  });

  it('are not created by reading a code', async () => {
    const res = await call('get', '/api/packets/NOPE01', { cookie: f.users.owner.cookie });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(await prisma.meetingPacket.count({ where: { robbieCode: 'NOPE01' } })).toBe(0);
  });

  it("are read by code only in the rule's organization", async () => {
    // A's rule passed, then the code moved to B before the handler ran
    const res = await runHandler(packetsRouter, 'get', '/packets/:robbieCode', {
      params: { robbieCode: f.packetB.code },
      org: { id: f.orgA.id, role: 'viewer' },
    });
    expect(res).toEqual({ status: 404, body: { error: 'Not found' } });
  });

  it('are presided over by their creator unless another member is named', async () => {
    const path = `/api/organizations/${f.orgA.id}/packets`;
    const cookie = f.users.secretary.cookie;
    const byCreator = await call('post', path, { cookie, body: { robbieCode: 'NEW001' } });
    expect(byCreator.body.chairUserId).toBe(f.users.secretary.id);

    const named = await call('post', path, {
      cookie,
      body: { robbieCode: 'NEW002', chairUserId: f.users.member.id },
    });
    expect(named.status).toBe(201);
    expect(named.body.chairUserId).toBe(f.users.member.id);

    const none = await call('post', path, {
      cookie,
      body: { robbieCode: 'NEW003', chairUserId: null },
    });
    expect(none.body.chairUserId).toBeNull();
  });

  it('refuse a presiding officer who is a viewer or outside the organization', async () => {
    for (const chairUserId of [f.users.viewer.id, f.outsider.id, 99999]) {
      const created = await call('post', `/api/organizations/${f.orgA.id}/packets`, {
        cookie: f.users.secretary.cookie,
        body: { robbieCode: 'NEW001', chairUserId },
      });
      expect(created.status, `create with ${chairUserId}`).toBe(400);
      expect(created.body).toEqual({ error: CHAIR_NOT_MEMBER });

      const updated = await call('put', `/api/packets/${f.packet.id}`, {
        cookie: f.users.secretary.cookie,
        body: { chairUserId },
      });
      expect(updated.status, `update to ${chairUserId}`).toBe(400);
    }
    expect(await prisma.meetingPacket.count({ where: { robbieCode: 'NEW001' } })).toBe(0);
  });

  it('change their presiding officer, or have none', async () => {
    const put = (chairUserId: number | null) =>
      call('put', `/api/packets/${f.packet.id}`, {
        cookie: f.users.secretary.cookie,
        body: { chairUserId },
      });
    expect((await put(f.users.admin.id)).body.chairUserId).toBe(f.users.admin.id);
    expect((await put(null)).body.chairUserId).toBeNull();
  });

  it('lose their presiding officer when the user is deleted', async () => {
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.member.id },
    });
    await prisma.user.delete({ where: { id: f.users.member.id } });
    const packet = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packet.id } });
    expect(packet.chairUserId).toBeNull();
  });

  it('are listed for the organization, meetings not yet adjourned first', async () => {
    const org = f.orgA.id;
    const create = (robbieCode: string, data: object) =>
      prisma.meetingPacket.create({ data: { organizationId: org, robbieCode, ...data } });
    await create('SOON01', { scheduledFor: new Date('2026-11-01') });
    await create('LATER1', { scheduledFor: new Date('2026-12-01') });
    await create('DONE01', {
      scheduledFor: new Date('2026-09-01'),
      startedAt: new Date('2026-09-01T19:00:00Z'),
      endedAt: new Date('2026-09-01T20:00:00Z'),
    });
    await create('DONE02', {
      scheduledFor: new Date('2026-10-01'),
      startedAt: new Date('2026-10-01T19:00:00Z'),
      endedAt: new Date('2026-10-01T20:00:00Z'),
    });

    const res = await call('get', `/api/organizations/${org}/packets`, {
      cookie: f.users.viewer.cookie,
    });
    expect(res.status).toBe(200);
    // The fixture's two packets have no date, so they follow the dated upcoming ones
    expect(res.body.map((p: { robbieCode: string }) => p.robbieCode)).toEqual([
      'SOON01',
      'LATER1',
      'ORGA01',
      'ORGA02',
      'DONE02',
      'DONE01',
    ]);
    expect(res.body[0]).toEqual({
      id: expect.any(String),
      robbieCode: 'SOON01',
      title: null,
      description: null,
      location: null,
      scheduledFor: '2026-11-01T00:00:00.000Z',
      chairUserId: null,
      startedAt: null,
      endedAt: null,
      chair: null,
    });
  });

  it('record where the meeting is held', async () => {
    const cookie = f.users.secretary.cookie;
    const created = await call('post', `/api/organizations/${f.orgA.id}/packets`, {
      cookie,
      body: { robbieCode: 'NEW001', location: 'Maple Grove Clubhouse' },
    });
    expect(created.status).toBe(201);
    expect(created.body.location).toBe('Maple Grove Clubhouse');

    const moved = await call('put', `/api/packets/${created.body.id}`, {
      cookie,
      body: { location: 'The pool deck' },
    });
    expect(moved.body.location).toBe('The pool deck');

    const unchanged = await call('put', `/api/packets/${created.body.id}`, {
      cookie,
      body: { title: 'Pool meeting' },
    });
    expect(unchanged.body.location).toBe('The pool deck');

    const cleared = await call('put', `/api/packets/${created.body.id}`, {
      cookie,
      body: { location: null },
    });
    expect(cleared.body.location).toBeNull();

    const tooLong = await call('post', `/api/organizations/${f.orgA.id}/packets`, {
      cookie,
      body: { robbieCode: 'NEW002', location: 'x'.repeat(501) },
    });
    expect(tooLong.status).toBe(400);
  });

  it('are no longer created without an organization', async () => {
    const res = await call('post', '/api/packets', {
      cookie: f.users.owner.cookie,
      body: { robbieCode: 'NEW002' },
    });
    expect(res.status).toBe(404);
  });
});
