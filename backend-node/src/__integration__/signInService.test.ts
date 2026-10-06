import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { captureEmailsForTests } from '../auth/emailService.js';
import {
  MAX_ATTEMPTS,
  MAX_CODES_PER_HOUR,
  SignInError,
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
    await requestSignInCode('ann@example.org', start);
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

  it('limits how many codes an email can request in an hour', async () => {
    for (let i = 0; i < MAX_CODES_PER_HOUR; i++) await requestSignInCode('ann@example.org');
    await expect(requestSignInCode('ann@example.org')).rejects.toMatchObject({ status: 429 });
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
