import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { resetDatabase } from './db.js';
import { signIn } from './helpers.js';

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
  ['get', '/api/packets/ABC123'],
  ['get', `/api/agenda-items/${ID}`],
  ['get', `/api/attachments/${ID}`],
  ['get', `/api/bylawyer/organizations/${ID}/documents`],
  ['get', '/api/no-such-route'],
];

describe('route protection', () => {
  let cookie: string;
  beforeAll(async () => {
    await resetDatabase();
    cookie = (await signIn('ann@example.org')).cookie;
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

  it('checks the session before reading an upload', async () => {
    const small = await request(app)
      .post('/api/attachments/upload')
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF-1.4 hello'));
    expect(small.status).toBe(401);

    // Over the parser's 10 MB limit: reading it first would answer 413, not 401
    const large = await request(app)
      .post('/api/attachments/upload')
      .set('Content-Type', 'application/pdf')
      .send(Buffer.alloc(11 * 1024 * 1024));
    expect(large.status).toBe(401);

    const signedIn = await request(app)
      .post('/api/attachments/upload')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF-1.4 hello'));
    expect(signedIn.status).not.toBe(401);
  });

  it('keeps health and public share links open', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/share/not-a-real-token')).status).not.toBe(401);
  });
});
