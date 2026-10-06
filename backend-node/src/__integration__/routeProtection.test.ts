import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { captureEmailsForTests } from '../auth/emailService.js';
import { resetAccounts } from './db.js';

const ID = '00000000-0000-4000-8000-000000000000';

// One route from every router behind authentication
const protectedRoutes: Array<[string, string]> = [
  ['get', '/api/organizations'],
  ['post', '/api/organizations'],
  ['get', `/api/organizations/${ID}/documents`],
  ['get', `/api/documents/${ID}`],
  ['get', `/api/versions/${ID}/tree`],
  ['get', `/api/sections/${ID}`],
  ['get', `/api/amendments/${ID}`],
  ['get', `/api/organizations/${ID}/meetings`],
  ['get', '/api/packets/ABC123'],
  ['get', `/api/agenda-items/${ID}`],
  ['get', `/api/attachments/${ID}`],
  ['get', '/api/robbie/sync-status/ABC123/1'],
  ['get', `/api/bylawyer/organizations`],
  ['get', '/api/no-such-route'],
];

describe('route protection', () => {
  let cookie: string;
  beforeAll(async () => {
    await resetAccounts();
    const outbox = captureEmailsForTests();
    await request(app).post('/api/auth/request-code').send({ email: 'ann@example.org' });
    const res = await request(app)
      .post('/api/auth/verify')
      .send({ email: 'ann@example.org', code: outbox[0].code });
    cookie = ([] as string[])
      .concat(res.headers['set-cookie'])
      .find((c) => c.startsWith('session='))!;
  });

  it.each(protectedRoutes)('%s %s needs a session', async (method, path) => {
    const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[
      method
    ](path);
    expect(res.status).toBe(401);
  });

  it.each(protectedRoutes)('%s %s is reached with a session', async (method, path) => {
    const agent = request(app) as unknown as Record<string, (p: string) => request.Test>;
    const res = await agent[method](path).set('Cookie', cookie);
    expect(res.status).not.toBe(401);
  });

  it('keeps health and public share links open', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/share/not-a-real-token')).status).not.toBe(401);
  });
});
