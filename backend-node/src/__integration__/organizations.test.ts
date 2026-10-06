import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
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
