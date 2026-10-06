import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { captureEmailsForTests } from '../auth/emailService.js';
import { createSession } from '../auth/sessionService.js';
import { prisma } from '../db/prisma.js';
import { resetAccounts } from './db.js';

let outbox: Array<{ to: string; code: string }>;

async function signIn(email: string, client?: 'web' | 'mobile') {
  await request(app).post('/api/auth/request-code').send({ email }).expect(200);
  const code = outbox[outbox.length - 1].code;
  return request(app).post('/api/auth/verify').send({ email, code, client });
}

const sessionCookie = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('session='));

describe('auth routes', () => {
  beforeEach(async () => {
    await resetAccounts();
    outbox = captureEmailsForTests();
  });

  it('signs a web client in with an httpOnly cookie, not a token in the body', async () => {
    const res = await signIn('ann@example.org');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'ann@example.org', name: null });
    expect(res.body.token).toBeUndefined();
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).toMatch(/Path=\//);
  });

  it('gives a mobile client its token in the body, and no cookie', async () => {
    const res = await signIn('ann@example.org', 'mobile');
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('knows who is signed in, by cookie or bearer token', async () => {
    const web = await signIn('ann@example.org');
    const me = await request(app).get('/api/auth/me').set('Cookie', sessionCookie(web)!);
    expect(me.body.user.email).toBe('ann@example.org');

    const mobile = await signIn('bo@example.org', 'mobile');
    const meToo = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${mobile.body.token}`);
    expect(meToo.body.user.email).toBe('bo@example.org');

    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('re-sends the cookie when a web session is extended', async () => {
    const userId = (await prisma.user.create({ data: { email: 'ann@example.org' } })).id;
    const lastUsed = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { token } = await createSession(userId, 'web', lastUsed);

    const res = await request(app).get('/api/auth/me').set('Cookie', `session=${token}`);
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res);
    expect(cookie).toContain(`session=${token}`);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).toMatch(/HttpOnly/i);

    // Used again within the hour: not extended, so no new cookie
    const again = await request(app).get('/api/auth/me').set('Cookie', `session=${token}`);
    expect(sessionCookie(again)).toBeUndefined();
  });

  it('never sends a cookie to a bearer client whose session is extended', async () => {
    const userId = (await prisma.user.create({ data: { email: 'ann@example.org' } })).id;
    const lastUsed = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { token } = await createSession(userId, 'mobile', lastUsed);

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('sets the display name', async () => {
    const cookie = sessionCookie(await signIn('ann@example.org'))!;
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Cookie', cookie)
      .send({ name: '  Ann Chair ' });
    expect(res.body.user.name).toBe('Ann Chair');
    expect(
      (await request(app).patch('/api/auth/me').set('Cookie', cookie).send({ name: 'A' })).status,
    ).toBe(400);
  });

  it('ends the session on sign-out', async () => {
    const cookie = sessionCookie(await signIn('ann@example.org'))!;
    await request(app).post('/api/auth/sign-out').set('Cookie', cookie).expect(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('ends every session on sign-out everywhere', async () => {
    const web = sessionCookie(await signIn('ann@example.org'))!;
    const phone = (await signIn('ann@example.org', 'mobile')).body.token;
    await request(app).post('/api/auth/sign-out-everywhere').set('Cookie', web).expect(200);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', `Bearer ${phone}`)).status,
    ).toBe(401);
  });

  it('answers a wrong code with 401 and the message', async () => {
    await request(app).post('/api/auth/request-code').send({ email: 'ann@example.org' });
    const code = outbox[0].code === '000001' ? '000002' : '000001';
    const res = await request(app)
      .post('/api/auth/verify')
      .send({ email: 'ann@example.org', code });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('That code is wrong or has expired');
  });

  it('removes the old per-meeting endpoints', async () => {
    const cookie = sessionCookie(await signIn('ann@example.org'))!;
    const old1 = await request(app)
      .post('/api/auth/request-verification')
      .set('Cookie', cookie)
      .send({});
    expect(old1.status).toBe(404);
    expect((await request(app).get('/api/auth/dev-code').set('Cookie', cookie)).status).toBe(404);
  });
});
