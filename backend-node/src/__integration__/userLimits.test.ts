import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db/prisma.js';
import { MEETING_CODE_LIMIT, WRITE_LIMIT } from '../middleware/userLimits.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';

// The per-user limits are off under NODE_ENV=test (tests write a great deal as one user), so
// each test turns them on
describe('per-user limits', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });
  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('limit how many meetings one user schedules in an hour', async () => {
    process.env.NODE_ENV = 'development';
    const schedule = () =>
      call('post', `/api/organizations/${f.orgA.id}/packets`, {
        cookie: f.users.secretary.cookie,
        body: { title: 'Board meeting' },
      });
    for (let i = 0; i < MEETING_CODE_LIMIT; i++) {
      expect((await schedule()).status, `meeting ${i + 1}`).toBe(201);
    }
    const over = await schedule();
    expect(over.status).toBe(429);
    expect(over.body).toEqual({
      error: 'Too many meetings scheduled in an hour. Try again later.',
    });
    // Another user is unaffected
    const admin = await call('post', `/api/organizations/${f.orgA.id}/packets`, {
      cookie: f.users.admin.cookie,
      body: {},
    });
    expect(admin.status).toBe(201);
  });

  it("limit one user's changes, not their reading", async () => {
    process.env.NODE_ENV = 'development';
    const cookie = f.users.viewer.cookie;
    // Refused for the role, but counted: the limit runs before the routes
    for (let i = 0; i < WRITE_LIMIT; i++) {
      const res = await call('put', `/api/organizations/${f.orgA.id}`, { cookie, body: {} });
      expect(res.status, `change ${i + 1}`).toBe(403);
    }
    const over = await call('put', `/api/organizations/${f.orgA.id}`, { cookie, body: {} });
    expect(over.status).toBe(429);
    expect((await call('get', `/api/organizations/${f.orgA.id}`, { cookie })).status).toBe(200);
  });
});

describe('an upload', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('is read only for a secretary: a viewer is refused before the body is', async () => {
    const before = await prisma.attachment.count();
    // Over the 10 MB an upload may be: read first, it would be refused as too large (413)
    const res = await call('post', `/api/attachments/upload?packetId=${f.packet.id}`, {
      cookie: f.users.viewer.cookie,
      headers: {
        'Content-Type': 'application/pdf',
        'X-Filename': 'big.pdf',
        'X-Robbie-Code': f.packet.code,
      },
      body: Buffer.alloc(11 * 1024 * 1024),
    });
    expect(res.status).toBe(403);
    expect(await prisma.attachment.count()).toBe(before);
  });
});
