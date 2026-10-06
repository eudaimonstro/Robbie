import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { packetsRouter } from '../bylawyer/routes/packets.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call, runHandler } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('packet rules', [
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

  it('are no longer created without an organization', async () => {
    const res = await call('post', '/api/packets', {
      cookie: f.users.owner.cookie,
      body: { robbieCode: 'NEW002' },
    });
    expect(res.status).toBe(404);
  });
});
