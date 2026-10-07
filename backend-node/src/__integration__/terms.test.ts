import { describe, it, expect, beforeEach } from 'vitest';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { call, signIn } from './helpers.js';

describe('terms acceptance', () => {
  beforeEach(resetDatabase);

  it('reports whether the user has accepted the current terms', async () => {
    const ann = await signIn('ann@example.org', { acceptTerms: false });
    const before = await call('get', '/api/auth/me', { cookie: ann.cookie });
    expect(before.body).toMatchObject({
      user: { email: 'ann@example.org' },
      termsAccepted: false,
    });
    expect(before.body.user.termsVersion).toBeUndefined();

    const bo = await signIn('bo@example.org');
    const me = await call('get', '/api/auth/me', { cookie: bo.cookie });
    expect(me.body.termsAccepted).toBe(true);
  });

  it('records acceptance of the current version', async () => {
    const ann = await signIn('ann@example.org', { acceptTerms: false });
    const res = await call('post', '/api/auth/accept-terms', {
      cookie: ann.cookie,
      body: { version: TERMS_VERSION },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ termsAccepted: true });

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: ann.id } });
    expect(stored.termsVersion).toBe(TERMS_VERSION);
    expect(stored.termsAcceptedAt).toBeInstanceOf(Date);
    const me = await call('get', '/api/auth/me', { cookie: ann.cookie });
    expect(me.body.termsAccepted).toBe(true);
  });

  it('refuses to accept a version other than the current one', async () => {
    const ann = await signIn('ann@example.org', { acceptTerms: false });
    const res = await call('post', '/api/auth/accept-terms', {
      cookie: ann.cookie,
      body: { version: '2000-01-01' },
    });
    expect(res.status).toBe(409);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: ann.id } });
    expect(stored.termsVersion).toBeNull();
  });

  it('needs a session to accept', async () => {
    const res = await call('post', '/api/auth/accept-terms', { body: { version: TERMS_VERSION } });
    expect(res.status).toBe(401);
  });

  it('refuses the rest of the API until the terms are accepted', async () => {
    const ann = await signIn('ann@example.org', { acceptTerms: false });
    const refused = await call('get', '/api/organizations', { cookie: ann.cookie });
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual({
      error: 'Accept the terms to continue',
      code: 'TERMS_NOT_ACCEPTED',
    });

    // Uploads are refused before the body is read: if the body parser ran first, one byte over
    // the 10 MB upload limit would fail on the size limit instead
    const upload = await call('post', '/api/attachments/upload', {
      cookie: ann.cookie,
      headers: { 'Content-Type': 'application/pdf' },
      body: Buffer.alloc(10 * 1024 * 1024 + 1),
    });
    expect(upload.status).toBe(403);

    await call('post', '/api/auth/accept-terms', {
      cookie: ann.cookie,
      body: { version: TERMS_VERSION },
    }).expect(200);
    expect((await call('get', '/api/organizations', { cookie: ann.cookie })).status).toBe(200);
  });

  it('asks again when the terms change', async () => {
    const ann = await signIn('ann@example.org');
    await prisma.user.update({ where: { id: ann.id }, data: { termsVersion: '2000-01-01' } });
    const me = await call('get', '/api/auth/me', { cookie: ann.cookie });
    expect(me.body.termsAccepted).toBe(false);
    expect((await call('get', '/api/organizations', { cookie: ann.cookie })).status).toBe(403);
  });

  it('keeps sign-in routes and the health check open without acceptance', async () => {
    expect((await call('get', '/api/health')).status).toBe(200);
    const ann = await signIn('ann@example.org', { acceptTerms: false });
    const named = await call('patch', '/api/auth/me', {
      cookie: ann.cookie,
      body: { name: 'Ann' },
    });
    expect(named.status).toBe(200);
  });
});
