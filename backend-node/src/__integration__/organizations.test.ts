import fs from 'fs';
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { getFullPath, storeFile } from '../bylawyer/services/fileStorage.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call, signIn } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('organization rules', [
  {
    method: 'get',
    route: '/organizations/by-slug/:slug',
    path: (f) => `/api/organizations/by-slug/${f.orgA.slug}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/organizations/:id',
    path: (f) => `/api/organizations/${f.orgA.id}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/organizations/:id',
    path: (f) => `/api/organizations/${f.orgA.id}`,
    body: () => ({ name: 'Renamed' }),
    min: 'admin',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/organizations/:id',
    path: (f) => `/api/organizations/${f.orgA.id}`,
    min: 'owner',
    ok: 204,
  },
]);

describe('organizations', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it("lists only the user's organizations, each with the user's role", async () => {
    const member = await call('get', '/api/organizations', { cookie: f.users.member.cookie });
    expect(member.status).toBe(200);
    expect(member.body).toEqual([
      expect.objectContaining({ id: f.orgA.id, name: 'Org A', role: 'member' }),
    ]);

    const outsider = await call('get', '/api/organizations', { cookie: f.outsider.cookie });
    expect(outsider.body).toEqual([
      expect.objectContaining({ id: f.orgB.id, name: 'Org B', role: 'owner' }),
    ]);

    const nobody = await signIn('nobody@example.org');
    expect((await call('get', '/api/organizations', { cookie: nobody.cookie })).body).toEqual([]);
  });

  it('leaves out inactive organizations unless asked, and pages', async () => {
    await prisma.organization.update({ where: { id: f.orgA.id }, data: { isActive: false } });
    const cookie = f.users.viewer.cookie;
    expect((await call('get', '/api/organizations', { cookie })).body).toEqual([]);
    const all = await call('get', '/api/organizations?active_only=false', { cookie });
    expect(all.body).toHaveLength(1);

    const page = await call('get', '/api/organizations?active_only=false&page=1&limit=1', {
      cookie,
    });
    expect(page.body).toEqual({
      data: [expect.objectContaining({ id: f.orgA.id, role: 'viewer' })],
      pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
    });
  });

  it('makes the creator the owner', async () => {
    const ann = await signIn('ann@example.org');
    const res = await call('post', '/api/organizations', {
      cookie: ann.cookie,
      body: { name: 'Garden Club' },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Garden Club', slug: 'garden-club', role: 'owner' });

    const membership = await prisma.organizationMember.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: res.body.id, userId: ann.id } },
    });
    expect(membership.role).toBe('owner');
    const list = await call('get', '/api/organizations', { cookie: ann.cookie });
    expect(list.body).toEqual([expect.objectContaining({ id: res.body.id, role: 'owner' })]);
  });

  it('lets a user own at most 3 organizations', async () => {
    // The fixture's owner already owns Org A
    const cookie = f.users.owner.cookie;
    for (const name of ['Second', 'Third']) {
      expect((await call('post', '/api/organizations', { cookie, body: { name } })).status).toBe(
        201,
      );
    }
    const fourth = await call('post', '/api/organizations', { cookie, body: { name: 'Fourth' } });
    expect(fourth.status).toBe(429);
    expect(fourth.body).toEqual({ error: 'You can own at most 3 organizations' });
    expect(await prisma.organization.count({ where: { name: 'Fourth' } })).toBe(0);
  });

  it('holds the limit when creations arrive together', async () => {
    const cookie = f.users.owner.cookie;
    const results = await Promise.all(
      ['One', 'Two', 'Three'].map((name) =>
        call('post', '/api/organizations', { cookie, body: { name } }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 429]);
  });

  it('refuses a taken slug, also when two creations arrive together', async () => {
    const taken = await call('post', '/api/organizations', {
      cookie: f.users.owner.cookie,
      body: { name: 'Again', slug: f.orgA.slug },
    });
    expect(taken.status).toBe(400);
    expect(taken.body).toEqual({ error: "Organization with slug 'org-a' already exists" });

    // Different users, so the owner limit's lock doesn't order them
    const [ann, bob] = await Promise.all([signIn('ann@example.org'), signIn('bob@example.org')]);
    const results = await Promise.all(
      [ann, bob].map((user) =>
        call('post', '/api/organizations', {
          cookie: user.cookie,
          body: { name: 'Garden Club', slug: 'garden' },
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(results.find((r) => r.status === 400)!.body).toEqual({
      error: "Organization with slug 'garden' already exists",
    });
  });

  it("take their packets' files with them when deleted", async () => {
    const store = async (code: string) => {
      const stored = await storeFile(code, 'report.txt', 'text/plain', Buffer.from('R'));
      if (!stored.success) throw new Error(stored.error);
      return stored.file.storagePath;
    };
    const onItem = await store(f.packet.code);
    await prisma.attachment.create({
      data: { type: 'uploaded_file', storagePath: onItem, displayName: 'R', agendaItemId: f.item },
    });
    const inB = await store(f.packetB.code);
    await prisma.attachment.create({
      data: { type: 'uploaded_file', storagePath: inB, displayName: 'R', agendaItemId: f.itemB },
    });
    const upload = await prisma.attachment.findUniqueOrThrow({ where: { id: f.upload } });
    const files = [upload.storagePath!, onItem, inB].map(getFullPath);
    expect(files.map((file) => fs.existsSync(file))).toEqual([true, true, true]);

    const res = await call('delete', `/api/organizations/${f.orgA.id}`, {
      cookie: f.users.owner.cookie,
    });
    expect(res.status).toBe(204);
    // Org B's file stays
    expect(files.map((file) => fs.existsSync(file))).toEqual([false, false, true]);
  });

  it('start with a quorum of 3', async () => {
    const res = await call('get', `/api/organizations/${f.orgA.id}`, {
      cookie: f.users.viewer.cookie,
    });
    expect(res.body).toMatchObject({ eligibleVoters: null, quorumPercent: null, quorumCount: 3 });
  });

  it('set the voting members and the quorum, as a percentage or a count', async () => {
    const put = (body: object) =>
      call('put', `/api/organizations/${f.orgA.id}`, { cookie: f.users.admin.cookie, body });

    const percent = await put({ eligibleVoters: 142, quorumPercent: 20 });
    expect(percent.status).toBe(200);
    expect(percent.body).toMatchObject({
      eligibleVoters: 142,
      quorumPercent: 20,
      quorumCount: null,
    });

    const count = await put({ quorumCount: 25 });
    expect(count.body).toMatchObject({ eligibleVoters: 142, quorumPercent: null, quorumCount: 25 });

    const roster = await put({ eligibleVoters: null });
    expect(roster.body).toMatchObject({ eligibleVoters: null, quorumCount: 25 });

    const read = await call('get', `/api/organizations/${f.orgA.id}`, {
      cookie: f.users.viewer.cookie,
    });
    expect(read.body).toMatchObject({ eligibleVoters: null, quorumPercent: null, quorumCount: 25 });
  });

  it('refuse attendance settings out of range, or the quorum set both ways', async () => {
    for (const body of [
      { quorumPercent: 0 },
      { quorumPercent: 101 },
      { quorumPercent: 12.5 },
      { quorumCount: 0 },
      { quorumCount: null },
      { eligibleVoters: 0 },
      { quorumPercent: 20, quorumCount: 5 },
    ]) {
      const res = await call('put', `/api/organizations/${f.orgA.id}`, {
        cookie: f.users.admin.cookie,
        body,
      });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: f.orgA.id } });
    expect(org).toMatchObject({ eligibleVoters: null, quorumPercent: null, quorumCount: 3 });
  });

  it('changes only the name and description', async () => {
    const res = await call('put', `/api/organizations/${f.orgA.id}`, {
      cookie: f.users.admin.cookie,
      body: { name: 'New name', description: 'About us', slug: 'taken-over', isActive: false },
    });
    expect(res.status).toBe(200);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: f.orgA.id } });
    expect(org).toMatchObject({
      name: 'New name',
      description: 'About us',
      slug: 'org-a',
      isActive: true,
    });
  });
});
