import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('vote rules', [
  {
    method: 'put',
    route: '/organizations/:id/vote-rules',
    path: (f) => `/api/organizations/${f.orgA.id}/vote-rules`,
    body: () => ({ bylawAmendmentVote: 'majorityMembers' }),
    min: 'admin',
    ok: 200,
  },
]);

describe('what bylaw amendments need', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('is two thirds of the votes cast until an admin sets it, and comes with the organization', async () => {
    const read = () =>
      call('get', `/api/organizations/${f.orgA.id}`, { cookie: f.users.viewer.cookie });
    expect((await read()).body.bylawAmendmentVote).toBe('twoThirdsCast');

    const set = await call('put', `/api/organizations/${f.orgA.id}/vote-rules`, {
      cookie: f.users.admin.cookie,
      body: { bylawAmendmentVote: 'twoThirdsMembers' },
    });
    expect(set.status).toBe(200);
    expect(set.body).toEqual({ bylawAmendmentVote: 'twoThirdsMembers' });
    expect((await read()).body.bylawAmendmentVote).toBe('twoThirdsMembers');
    const listed = await call('get', '/api/organizations', { cookie: f.users.viewer.cookie });
    expect(listed.body.find((o: { id: string }) => o.id === f.orgA.id)).toMatchObject({
      bylawAmendmentVote: 'twoThirdsMembers',
    });
  });

  it('refuses anything but the four rules', async () => {
    for (const bylawAmendmentVote of ['threeQuarters', '', null, 2]) {
      const res = await call('put', `/api/organizations/${f.orgA.id}/vote-rules`, {
        cookie: f.users.admin.cookie,
        body: { bylawAmendmentVote },
      });
      expect(res.status, String(bylawAmendmentVote)).toBe(400);
    }
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: f.orgA.id } });
    expect(org.bylawAmendmentVote).toBe('twoThirdsCast');
  });
});
