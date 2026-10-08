import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { REQUEST_CODE_LIMIT_PER_IP, VERIFY_LIMIT_PER_IP } from '../auth/authRoutes.js';

// The per-IP limits are off under NODE_ENV=test (tests sign in many times from one address), so
// each test turns them on. The requests are malformed: the service refuses them (400) before
// touching the database, but the limiter counts them all.
describe('per-IP sign-in limits', () => {
  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('lets a room of people on one network ask for codes', async () => {
    process.env.NODE_ENV = 'development';
    expect(REQUEST_CODE_LIMIT_PER_IP).toBe(300);
    for (let i = 0; i < REQUEST_CODE_LIMIT_PER_IP; i++) {
      const res = await request(app).post('/api/auth/request-code').send({ email: 'not-an-email' });
      expect(res.status, `request ${i + 1}`).toBe(400);
    }
    const over = await request(app).post('/api/auth/request-code').send({ email: 'not-an-email' });
    expect(over.status).toBe(429);
  });

  it('lets a room of people on one network enter their codes', async () => {
    process.env.NODE_ENV = 'development';
    expect(VERIFY_LIMIT_PER_IP).toBe(600);
    const body = { email: 'homeowner@example.org', code: 'x' };
    for (let i = 0; i < VERIFY_LIMIT_PER_IP; i++) {
      const res = await request(app).post('/api/auth/verify').send(body);
      expect(res.status, `attempt ${i + 1}`).toBe(400);
    }
    expect((await request(app).post('/api/auth/verify').send(body)).status).toBe(429);
  });
});
