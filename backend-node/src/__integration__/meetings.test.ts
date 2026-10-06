import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('meeting rules', [
  {
    method: 'get',
    route: '/organizations/:orgId/meetings',
    path: (f) => `/api/organizations/${f.orgA.id}/meetings`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/organizations/:orgId/meetings',
    path: (f) => `/api/organizations/${f.orgA.id}/meetings`,
    body: () => ({ title: 'Annual meeting', scheduledDate: '2026-11-01' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/meetings/:id',
    path: (f) => `/api/meetings/${f.meeting}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/meetings/:id',
    path: (f) => `/api/meetings/${f.meeting}`,
    body: () => ({ location: 'Library' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/meetings/:id',
    path: (f) => `/api/meetings/${f.meeting}`,
    min: 'secretary',
    ok: 204,
  },
  {
    method: 'post',
    route: '/meetings/:id/votes',
    path: (f) => `/api/meetings/${f.meeting}/votes`,
    body: (f) => ({ amendmentId: f.proposed, yeaCount: 4, nayCount: 1 }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/meetings/:id/votes',
    path: (f) => `/api/meetings/${f.meeting}/votes`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/votes/:id',
    path: (f) => `/api/votes/${f.vote}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/votes/:id',
    path: (f) => `/api/votes/${f.vote}`,
    min: 'secretary',
    ok: 204,
  },
  {
    method: 'get',
    route: '/amendments/:id/votes',
    path: (f) => `/api/amendments/${f.passed}/votes`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('recording a vote', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('refuses an amendment from another organization', async () => {
    const res = await call('post', `/api/meetings/${f.meeting}/votes`, {
      cookie: f.users.secretary.cookie,
      body: { amendmentId: f.proposedB, yeaCount: 9, nayCount: 0 },
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Amendment not found' });
    const amendment = await prisma.amendment.findUniqueOrThrow({ where: { id: f.proposedB } });
    expect(amendment.status).toBe('proposed');
    expect(await prisma.vote.count({ where: { amendmentId: f.proposedB } })).toBe(0);
  });

  it('refuses a vote without an amendment', async () => {
    const res = await call('post', `/api/meetings/${f.meeting}/votes`, {
      cookie: f.users.secretary.cookie,
      body: { yeaCount: 1 },
    });
    expect(res.status).toBe(404);
  });
});
