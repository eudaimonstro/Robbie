import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('version rules', [
  {
    method: 'get',
    route: '/documents/:docId/versions',
    path: (f) => `/api/documents/${f.doc}/versions`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/documents/:docId/versions',
    path: (f) => `/api/documents/${f.doc}/versions`,
    body: () => ({ notes: 'Annual review' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/versions/:id',
    path: (f) => `/api/versions/${f.v2}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/versions/:id/tree',
    path: (f) => `/api/versions/${f.v2}/tree`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/versions/:id/text',
    path: (f) => `/api/versions/${f.v2}/text`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/versions/:id/diff/:otherId',
    path: (f) => `/api/versions/${f.v1}/diff/${f.v2}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/versions/:id',
    path: (f) => `/api/versions/${f.v2}`,
    body: () => ({ notes: 'Checked' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/versions/:id',
    path: (f) => `/api/versions/${f.v1}`,
    min: 'secretary',
    ok: 204,
  },
  {
    method: 'get',
    route: '/versions/:id/export/markdown',
    path: (f) => `/api/versions/${f.v2}/export/markdown`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('version diffs', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it("refuse another organization's version", async () => {
    const res = await call('get', `/api/versions/${f.v2}/diff/${f.versionB}`, {
      cookie: f.users.viewer.cookie,
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Version not found' });
  });

  it('refuse a version of another document in the same organization', async () => {
    const other = await prisma.document.create({
      data: { organizationId: f.orgA.id, title: 'Policies' },
    });
    const otherVersion = await prisma.version.create({
      data: { documentId: other.id, versionNumber: 1 },
    });
    const res = await call('get', `/api/versions/${f.v2}/diff/${otherVersion.id}`, {
      cookie: f.users.viewer.cookie,
    });
    expect(res.status).toBe(404);
  });
});
