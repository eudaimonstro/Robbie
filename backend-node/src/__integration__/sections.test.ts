import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('section rules', [
  {
    method: 'get',
    route: '/versions/:versionId/sections',
    path: (f) => `/api/versions/${f.v2}/sections`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/versions/:versionId/sections/reorder',
    path: (f) => `/api/versions/${f.v2}/sections/reorder`,
    body: (f) => [{ id: f.section, position: 0 }],
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/versions/:versionId/sections',
    path: (f) => `/api/versions/${f.v2}/sections`,
    body: () => ({ numberLabel: '2', title: 'Purpose' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/sections/:id',
    path: (f) => `/api/sections/${f.section}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/sections/:id',
    path: (f) => `/api/sections/${f.section}`,
    body: () => ({ title: 'Name and seal' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/sections/:id',
    path: (f) => `/api/sections/${f.child}`,
    min: 'secretary',
    ok: 204,
  },
  {
    method: 'post',
    route: '/sections/:id/children',
    path: (f) => `/api/sections/${f.section}/children`,
    body: () => ({ numberLabel: '1.2', content: 'The seal is round.' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/sections/:id/path',
    path: (f) => `/api/sections/${f.child}/path`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('sections from another organization', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('cannot be reordered through this version', async () => {
    const res = await call('put', `/api/versions/${f.v2}/sections/reorder`, {
      cookie: f.users.secretary.cookie,
      body: [
        { id: f.section, position: 1 },
        { id: f.sectionB, position: 5 },
      ],
    });
    expect(res.status).toBe(400);
    const sectionB = await prisma.section.findUniqueOrThrow({ where: { id: f.sectionB } });
    expect(sectionB.position).toBe(0);
  });

  it('cannot become a parent here', async () => {
    const created = await call('post', `/api/versions/${f.v2}/sections`, {
      cookie: f.users.secretary.cookie,
      body: { title: 'Stray', parentId: f.sectionB },
    });
    expect(created.status).toBe(400);
    const moved = await call('put', `/api/sections/${f.child}`, {
      cookie: f.users.secretary.cookie,
      body: { parentId: f.sectionB },
    });
    expect(moved.status).toBe(400);
  });
});
