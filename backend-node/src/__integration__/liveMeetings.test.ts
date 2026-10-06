import { describe, it, expect, beforeEach } from 'vitest';
import { bylawyerRouter } from '../bylawyer/bylawyerRouter.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call, runHandler } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('Bylawyer router rules', [
  {
    method: 'get',
    route: '/bylawyer/organizations/:orgId',
    path: (f) => `/api/bylawyer/organizations/${f.orgA.id}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/bylawyer/organizations/:orgId/documents',
    path: (f) => `/api/bylawyer/organizations/${f.orgA.id}/documents`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/bylawyer/link-meeting',
    path: () => '/api/bylawyer/link-meeting',
    body: (f) => ({ meetingCode: 'LIVE01', organizationId: f.orgA.id }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/bylawyer/link-meeting/:meetingCode',
    path: (f) => `/api/bylawyer/link-meeting/${f.emptyPacket.code}`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'get',
    route: '/bylawyer/meeting/:meetingCode/organization',
    path: (f) => `/api/bylawyer/meeting/${f.packet.code}/organization`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/bylawyer/documents/:docId/sections',
    path: (f) => `/api/bylawyer/documents/${f.doc}/sections`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/robbie/meetings/:amendmentId',
    path: (f) => `/api/robbie/meetings/${f.draft}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/robbie/sync-status/:meetingCode/:motionId',
    path: (f) => `/api/robbie/sync-status/${f.packet.code}/41`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('live meetings', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const link = (meetingCode: string, organizationId: string) =>
    call('post', '/api/bylawyer/link-meeting', {
      cookie: f.users.secretary.cookie,
      body: { meetingCode, organizationId },
    });

  it('are linked by giving the code a packet in the organization', async () => {
    const res = await link('LIVE01', f.orgA.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      meetingCode: 'LIVE01',
      organization: { id: f.orgA.id, name: 'Org A', slug: 'org-a' },
    });
    const packet = await prisma.meetingPacket.findUniqueOrThrow({
      where: { robbieCode: 'LIVE01' },
    });
    expect(packet.organizationId).toBe(f.orgA.id);

    // Linking again to the same organization is fine
    expect((await link('LIVE01', f.orgA.id)).status).toBe(200);
    const found = await call('get', '/api/bylawyer/meeting/LIVE01/organization', {
      cookie: f.users.viewer.cookie,
    });
    expect(found.body).toMatchObject({ linked: true, organization: { id: f.orgA.id } });
  });

  it("can't take a code that belongs to another organization", async () => {
    const res = await link(f.packetB.code, f.orgA.id);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'That meeting code is already in use' });
    const packetB = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packetB.id } });
    expect(packetB.organizationId).toBe(f.orgB.id);
  });

  it('keep a packet with an agenda or attachments when unlinked', async () => {
    const res = await call('delete', `/api/bylawyer/link-meeting/${f.packet.code}`, {
      cookie: f.users.secretary.cookie,
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Remove the agenda and attachments first' });
    expect(await prisma.meetingPacket.count({ where: { id: f.packet.id } })).toBe(1);
  });

  it("unlink only their own organization's packet", async () => {
    // A's rule passed, then the code was unlinked and linked to B before the handler ran
    const packetB = await prisma.meetingPacket.create({
      data: { organizationId: f.orgB.id, robbieCode: 'ORGB02' },
    });
    const res = await runHandler(bylawyerRouter, 'delete', '/link-meeting/:meetingCode', {
      params: { meetingCode: 'ORGB02' },
      org: { id: f.orgA.id, role: 'secretary' },
    });
    expect(res).toEqual({ status: 404, body: { error: 'Not found' } });
    expect(await prisma.meetingPacket.count({ where: { id: packetB.id } })).toBe(1);
  });

  it('that are not linked are not found', async () => {
    const res = await call('get', '/api/bylawyer/meeting/NOPE01/organization', {
      cookie: f.users.owner.cookie,
    });
    expect(res.status).toBe(404);
  });

  it("report the sync status of their own organization's amendments only", async () => {
    await prisma.amendment.create({
      data: {
        documentId: f.docB,
        title: 'Synced into B',
        status: 'passed',
        robbieMeetingCode: f.packet.code,
        robbieMotionId: 41,
      },
    });
    const path = `/api/robbie/sync-status/${f.packet.code}/41`;
    const cookie = f.users.viewer.cookie;
    expect((await call('get', path, { cookie })).body).toEqual({ synced: false });

    const own = await prisma.amendment.create({
      data: {
        documentId: f.doc,
        title: 'Synced into A',
        status: 'passed',
        robbieMeetingCode: f.packet.code,
        robbieMotionId: 42,
      },
    });
    const synced = await call('get', `/api/robbie/sync-status/${f.packet.code}/42`, { cookie });
    expect(synced.body).toEqual({
      synced: true,
      amendmentId: own.id,
      status: 'passed',
      applied: false,
    });
  });

  it("list only the user's organizations for the meeting screens", async () => {
    const res = await call('get', '/api/bylawyer/organizations', {
      cookie: f.users.secretary.cookie,
    });
    expect(res.body).toEqual([expect.objectContaining({ id: f.orgA.id, role: 'secretary' })]);
  });

  it('no longer sync motions or list synced amendments over HTTP', async () => {
    const cookie = f.users.owner.cookie;
    const sync = await call('post', '/api/robbie/sync-motion', {
      cookie,
      body: {
        meetingCode: f.packet.code,
        motionId: 1,
        passed: true,
        bylawAmendment: { documentId: f.doc, changeType: 'delete', targetSectionId: f.child },
      },
    });
    expect(sync.status).toBe(404);
    expect((await call('get', '/api/robbie/amendments', { cookie })).status).toBe(404);
  });
});
