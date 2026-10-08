import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('Bylawyer router rules', [
  {
    method: 'get',
    route: '/bylawyer/organizations/:orgId/documents',
    path: (f) => `/api/bylawyer/organizations/${f.orgA.id}/documents`,
    min: 'viewer',
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
]);

describe('live meetings', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('are found by their code in any case', async () => {
    const found = await call('get', '/api/bylawyer/meeting/orga01/organization', {
      cookie: f.users.viewer.cookie,
    });
    expect(found.body).toMatchObject({ linked: true, organization: { id: f.orgA.id } });
  });

  it('refuse codes outside the live meeting format', async () => {
    for (const code of ['ABCDEFGHI', 'AB-C01']) {
      const res = await call('get', `/api/bylawyer/meeting/${code}/organization`, {
        cookie: f.users.secretary.cookie,
      });
      expect(res.status, code).toBe(400);
    }
  });

  it('without a packet are not found', async () => {
    const res = await call('get', '/api/bylawyer/meeting/NOPE01/organization', {
      cookie: f.users.owner.cookie,
    });
    expect(res.status).toBe(404);
  });

  it('are scheduled, not linked: the old linking and sync routes are gone', async () => {
    const cookie = f.users.owner.cookie;
    const gone = [
      call('get', '/api/bylawyer/organizations', { cookie }),
      call('get', `/api/bylawyer/organizations/${f.orgA.id}`, { cookie }),
      call('post', '/api/bylawyer/link-meeting', {
        cookie,
        body: { meetingCode: 'LIVE01', organizationId: f.orgA.id },
      }),
      call('delete', `/api/bylawyer/link-meeting/${f.emptyPacket.code}`, { cookie }),
      call('get', `/api/robbie/meetings/${f.draft}`, { cookie }),
      call('get', `/api/robbie/sync-status/${f.packet.code}/41`, { cookie }),
      call('post', '/api/robbie/sync-motion', { cookie, body: {} }),
    ];
    for (const res of await Promise.all(gone)) expect(res.status).toBe(404);
  });
});
