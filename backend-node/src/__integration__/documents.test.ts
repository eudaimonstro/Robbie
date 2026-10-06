import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('document rules', [
  {
    method: 'get',
    route: '/organizations/:orgId/documents',
    path: (f) => `/api/organizations/${f.orgA.id}/documents`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/organizations/:orgId/documents',
    path: (f) => `/api/organizations/${f.orgA.id}/documents`,
    body: () => ({ title: 'Standing rules', docType: 'standing_rules' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/documents/:id',
    path: (f) => `/api/documents/${f.doc}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/documents/:id',
    path: (f) => `/api/documents/${f.doc}`,
    body: () => ({ title: 'Amended bylaws' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/documents/:id',
    path: (f) => `/api/documents/${f.doc}`,
    min: 'secretary',
    ok: 204,
  },
  {
    method: 'get',
    route: '/documents/:id/at-date',
    path: (f) => `/api/documents/${f.doc}/at-date?date=2026-01-01`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/documents/:id/share',
    path: (f) => `/api/documents/${f.doc}/share`,
    min: 'admin',
    ok: 200,
  },
  {
    method: 'post',
    route: '/documents/:id/share',
    path: (f) => `/api/documents/${f.doc}/share`,
    min: 'admin',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/documents/:id/share',
    path: (f) => `/api/documents/${f.doc}/share`,
    min: 'admin',
    ok: 204,
  },
  {
    method: 'post',
    route: '/documents/:id/share/regenerate',
    path: (f) => `/api/documents/${f.doc}/share/regenerate`,
    min: 'admin',
    ok: 200,
  },
]);

describe('share links', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('are left out of document responses', async () => {
    const cookie = f.users.viewer.cookie;
    const responses = [
      (await call('get', `/api/documents/${f.doc}`, { cookie })).body,
      ...(await call('get', `/api/organizations/${f.orgA.id}/documents`, { cookie })).body,
      ...(await call('get', `/api/organizations/${f.orgA.id}/documents?page=1`, { cookie })).body
        .data,
      ...(await call('get', `/api/bylawyer/organizations/${f.orgA.id}/documents`, { cookie })).body,
      (
        await call('put', `/api/documents/${f.doc}`, {
          cookie: f.users.secretary.cookie,
          body: { title: 'Renamed' },
        })
      ).body,
    ];
    expect(responses).toHaveLength(5);
    for (const doc of responses) {
      expect(doc).toMatchObject({ id: f.doc, shareEnabled: true });
      expect(doc).not.toHaveProperty('shareToken');
    }
  });

  it('leave out annotations', async () => {
    const shared = await call('get', `/api/share/${f.shareToken}`);
    expect(shared.status).toBe(200);
    const [root] = shared.body.currentVersion.sections;
    expect(root.content).toBe('The name is A.');
    expect(root).not.toHaveProperty('annotation');
    expect(root.children[0]).not.toHaveProperty('annotation');

    const version = await call('get', `/api/share/${f.shareToken}/versions/${f.v2}`);
    expect(version.status).toBe(200);
    expect(version.body.sections[0]).not.toHaveProperty('annotation');
    expect(version.body.sections[0].children[0]).not.toHaveProperty('annotation');
  });

  it('still show annotations to members', async () => {
    const tree = await call('get', `/api/versions/${f.v2}/tree`, {
      cookie: f.users.viewer.cookie,
    });
    expect(tree.body[0].annotation).toBe('Internal note');
  });
});
