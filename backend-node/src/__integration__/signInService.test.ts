import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { captureEmailsForTests } from '../auth/emailService.js';
import {
  MAX_ATTEMPTS,
  MAX_CODES_PER_EMAIL,
  MAX_CODES_PER_EMAIL_FROM_ADDRESS,
  MAX_EMAILS_PER_ADDRESS,
  SignInError,
  addressKey,
  requestSignInCode,
  verifySignInCode,
} from '../auth/signInService.js';
import { hashSecret } from '../auth/tokens.js';
import { resetAccounts } from './db.js';

let outbox: Array<{ to: string; code: string }>;
const lastCode = () => outbox[outbox.length - 1].code;
const wrong = (code: string) => (code === '000001' ? '000002' : '000001');

describe('signInService', () => {
  beforeEach(async () => {
    await resetAccounts();
    outbox = captureEmailsForTests();
  });
  afterEach(() => {
    delete process.env.ENABLE_TEST_AUTH;
    process.env.NODE_ENV = 'test';
  });

  it('emails a code that signs in a new user, without a name yet', async () => {
    await requestSignInCode('  Ann@Example.org ');
    expect(outbox[0].to).toBe('ann@example.org');
    const user = await verifySignInCode('ann@example.org', lastCode());
    expect(user).toMatchObject({ email: 'ann@example.org', name: null });
  });

  it('signs an existing user in to the same account', async () => {
    await requestSignInCode('ann@example.org');
    const first = await verifySignInCode('ann@example.org', lastCode());
    await requestSignInCode('ann@example.org');
    const second = await verifySignInCode('ann@example.org', lastCode());
    expect(second.id).toBe(first.id);
  });

  it('accepts a code once', async () => {
    await requestSignInCode('ann@example.org');
    const code = lastCode();
    await verifySignInCode('ann@example.org', code);
    await expect(verifySignInCode('ann@example.org', code)).rejects.toMatchObject({ status: 401 });
  });

  it('replaces an earlier code with a new one', async () => {
    await requestSignInCode('ann@example.org');
    const first = lastCode();
    await requestSignInCode('ann@example.org');
    await expect(verifySignInCode('ann@example.org', first)).rejects.toBeInstanceOf(SignInError);
    await expect(verifySignInCode('ann@example.org', lastCode())).resolves.toBeTruthy();
  });

  it('keeps the later code when two requests overlap', async () => {
    const earlier = new Date(Date.now() - 1000);
    const later = new Date(earlier.getTime() + 1);
    // The later request starts first, so it tends to finish first; the earlier one must not
    // then cancel it. (Whether the earlier code survives depends on timing.)
    await Promise.all([
      requestSignInCode('ann@example.org', undefined, later),
      requestSignInCode('ann@example.org', undefined, earlier),
    ]);
    const stored = await prisma.signInCode.findMany();
    const latest = stored.find((r) => r.createdAt.getTime() === later.getTime())!;
    expect(latest.consumedAt).toBeNull();

    const code = outbox.find((m) => hashSecret(m.code) === latest.codeHash)!.code;
    await expect(verifySignInCode('ann@example.org', code)).resolves.toBeTruthy();
  });

  it('cancels neither code when two overlapping requests share a time', async () => {
    const now = new Date(Date.now() - 1000);
    await Promise.all([
      requestSignInCode('ann@example.org', undefined, now),
      requestSignInCode('ann@example.org', undefined, now),
    ]);
    expect(await prisma.signInCode.count({ where: { consumedAt: null } })).toBe(2);
  });

  it('keeps the earlier code when a new one fails to send', async () => {
    await requestSignInCode('ann@example.org');
    const first = lastCode();
    // Production without an email provider fails to send
    process.env.NODE_ENV = 'production';
    await expect(requestSignInCode('ann@example.org')).rejects.toMatchObject({ status: 502 });
    process.env.NODE_ENV = 'test';
    await expect(verifySignInCode('ann@example.org', first)).resolves.toMatchObject({
      email: 'ann@example.org',
    });
  });

  it('rejects an expired code', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    await requestSignInCode('ann@example.org', undefined, start);
    const later = new Date(start.getTime() + 16 * 60 * 1000);
    await expect(verifySignInCode('ann@example.org', lastCode(), later)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('gives up on a code after too many wrong guesses', async () => {
    await requestSignInCode('ann@example.org');
    const code = lastCode();
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await expect(verifySignInCode('ann@example.org', wrong(code))).rejects.toMatchObject({
        status: 401,
      });
    }
    await expect(verifySignInCode('ann@example.org', wrong(code))).rejects.toMatchObject({
      status: 429,
    });
    // Even the right code no longer works
    await expect(verifySignInCode('ann@example.org', code)).rejects.toMatchObject({ status: 401 });
  });

  it('counts concurrent wrong guesses against the attempt limit', async () => {
    await requestSignInCode('ann@example.org');
    const code = lastCode();
    const guesses = await Promise.allSettled(
      Array.from({ length: MAX_ATTEMPTS + 10 }, () =>
        verifySignInCode('ann@example.org', wrong(code)),
      ),
    );
    for (const guess of guesses) {
      expect(guess.status).toBe('rejected');
      expect((guess as PromiseRejectedResult).reason).toBeInstanceOf(SignInError);
    }
    const stored = await prisma.signInCode.findFirstOrThrow();
    expect(stored.attempts).toBeLessThanOrEqual(MAX_ATTEMPTS);
    await expect(verifySignInCode('ann@example.org', code)).rejects.toBeInstanceOf(SignInError);
  });

  it('limits how many codes an email can request in an hour from one address', async () => {
    expect(MAX_CODES_PER_EMAIL_FROM_ADDRESS).toBe(5);
    for (let i = 0; i < MAX_CODES_PER_EMAIL_FROM_ADDRESS; i++) {
      await requestSignInCode('ann@example.org', '203.0.113.9');
    }
    await expect(requestSignInCode('ann@example.org', '203.0.113.9')).rejects.toMatchObject({
      status: 429,
      message: 'Too many codes requested. Try again in an hour.',
    });
    // Someone else's requests don't lock Ann out: from her own network she still gets a code
    await requestSignInCode('ann@example.org', '198.51.100.7');
    await expect(verifySignInCode('ann@example.org', lastCode())).resolves.toMatchObject({
      email: 'ann@example.org',
    });
  });

  it('limits how many codes an email can request in an hour from all addresses', async () => {
    expect(MAX_CODES_PER_EMAIL).toBe(20);
    for (let i = 0; i < MAX_CODES_PER_EMAIL; i++) {
      await requestSignInCode('ann@example.org', `203.0.113.${Math.floor(i / 5)}`);
    }
    await expect(requestSignInCode('ann@example.org', '198.51.100.7')).rejects.toMatchObject({
      status: 429,
    });
  });

  it('limits how many sign-in emails one address sends in an hour, sized for a clubhouse', async () => {
    expect(MAX_EMAILS_PER_ADDRESS).toBe(200);
    const from = addressKey('203.0.113.9');
    expect(from).not.toContain('203.0.113.9');
    await prisma.signInCode.createMany({
      data: Array.from({ length: MAX_EMAILS_PER_ADDRESS }, (_, i) => ({
        email: `homeowner${i}@example.org`,
        codeHash: 'x',
        expiresAt: new Date(Date.now() + 60_000),
        requestedFrom: from,
      })),
    });
    await expect(requestSignInCode('ann@example.org', '203.0.113.9')).rejects.toMatchObject({
      status: 429,
      message: 'Too many sign-in emails from this network. Try again in an hour.',
    });
    expect(outbox).toHaveLength(0);
    // Another network is unaffected
    await requestSignInCode('ann@example.org', '198.51.100.7');
    expect(outbox).toHaveLength(1);
  });

  it('locks only the code guessed at: a new code signs in', async () => {
    await requestSignInCode('ann@example.org', '203.0.113.9');
    const guessed = lastCode();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await expect(verifySignInCode('ann@example.org', wrong(guessed))).rejects.toBeInstanceOf(
        SignInError,
      );
    }
    await requestSignInCode('ann@example.org', '198.51.100.7');
    await expect(verifySignInCode('ann@example.org', lastCode())).resolves.toMatchObject({
      email: 'ann@example.org',
    });
  });

  it('rejects a malformed email or code', async () => {
    await expect(requestSignInCode('not-an-email')).rejects.toMatchObject({ status: 400 });
    await expect(verifySignInCode('ann@example.org', '12ab56')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('accepts the test code only when test sign-in is enabled', async () => {
    await expect(verifySignInCode('bo@example.org', '000000')).rejects.toBeInstanceOf(SignInError);
    process.env.ENABLE_TEST_AUTH = 'true';
    await expect(verifySignInCode('bo@example.org', '000000')).resolves.toMatchObject({
      email: 'bo@example.org',
    });
  });

  it('stores codes only as hashes', async () => {
    await requestSignInCode('ann@example.org');
    const stored = await prisma.signInCode.findFirstOrThrow();
    expect(stored.codeHash).toBe(hashSecret(lastCode()));
  });
});
