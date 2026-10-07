import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { authenticate } from '../auth/authenticate.js';
import { orgOfOrganization } from '../orgs/resolvers.js';
import {
  accessRuleOf,
  fromBody,
  fromParam,
  fromQuery,
  requireRole,
  signedInOnly,
} from '../orgs/requireRole.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';

// A small app with one rule for each way of finding the organization
const testApp = express();
testApp.use(cookieParser() as unknown as express.RequestHandler, express.json(), authenticate);
// Typed loosely so it fits any route's parameters
const showOrg = (req: { org?: unknown }, res: express.Response) => {
  res.json(req.org);
};
testApp.get(
  '/by-param/:orgId',
  requireRole('secretary', fromParam('orgId', orgOfOrganization)),
  showOrg,
);
testApp.post('/by-body', requireRole('secretary', fromBody('orgId', orgOfOrganization)), showOrg);
testApp.get('/by-query', requireRole('secretary', fromQuery('orgId', orgOfOrganization)), showOrg);
testApp.get(
  '/broken',
  requireRole('viewer', async () => {
    throw new Error('lookup failed');
  }),
  showOrg,
);

const MISSING = '00000000-0000-4000-8000-000000000000';

describe('requireRole', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('lets a member with the role or higher through, and records the role', async () => {
    const secretary = await request(testApp)
      .get(`/by-param/${f.orgA.id}`)
      .set('Cookie', f.users.secretary.cookie);
    expect(secretary.status).toBe(200);
    expect(secretary.body).toEqual({ id: f.orgA.id, role: 'secretary' });

    const owner = await request(testApp)
      .get(`/by-param/${f.orgA.id}`)
      .set('Cookie', f.users.owner.cookie);
    expect(owner.body).toEqual({ id: f.orgA.id, role: 'owner' });
  });

  it('answers 403 naming the role when the role is too low', async () => {
    const res = await request(testApp)
      .get(`/by-param/${f.orgA.id}`)
      .set('Cookie', f.users.member.cookie);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'You need the secretary role for this' });
  });

  it('answers 404 to a non-member and for an organization that does not exist', async () => {
    const outsider = await request(testApp)
      .get(`/by-param/${f.orgA.id}`)
      .set('Cookie', f.outsider.cookie);
    expect(outsider.status).toBe(404);
    expect(outsider.body).toEqual({ error: 'Not found' });

    const missing = await request(testApp)
      .get(`/by-param/${MISSING}`)
      .set('Cookie', f.users.owner.cookie);
    expect(missing.status).toBe(404);
  });

  it('finds the organization through the body or the query', async () => {
    const body = await request(testApp)
      .post('/by-body')
      .set('Cookie', f.users.admin.cookie)
      .send({ orgId: f.orgA.id });
    expect(body.body).toEqual({ id: f.orgA.id, role: 'admin' });

    const query = await request(testApp)
      .get(`/by-query?orgId=${f.orgA.id}`)
      .set('Cookie', f.users.admin.cookie);
    expect(query.body).toEqual({ id: f.orgA.id, role: 'admin' });

    // Nothing to resolve from: not found
    const none = await request(testApp).post('/by-body').set('Cookie', f.users.admin.cookie);
    expect(none.status).toBe(404);
  });

  it('answers 404 to an organization id that is not a single string', async () => {
    const cookie = f.users.admin.cookie;
    const id = f.orgA.id;
    // Each would find the organization if the value were coerced to its first string
    const repeated = await request(testApp)
      .get(`/by-query?orgId=${id}&orgId=${id}`)
      .set('Cookie', cookie);
    expect(repeated.status).toBe(404);
    const emptyQuery = await request(testApp).get('/by-query?orgId=').set('Cookie', cookie);
    expect(emptyQuery.status).toBe(404);

    for (const orgId of [[id], {}, '']) {
      const res = await request(testApp).post('/by-body').set('Cookie', cookie).send({ orgId });
      expect(res.status).toBe(404);
    }
  });

  it('answers 500 when the lookup fails', async () => {
    const res = await request(testApp).get('/broken').set('Cookie', f.users.owner.cookie);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to check access' });
  });

  it('marks its handlers so the route test can find them', () => {
    expect(accessRuleOf(requireRole('admin', fromParam('id', orgOfOrganization)))).toEqual({
      kind: 'role',
      min: 'admin',
    });
    expect(accessRuleOf(signedInOnly())).toEqual({ kind: 'signedIn' });
    expect(accessRuleOf(() => undefined)).toBeNull();
  });
});
