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
const ANN = 'ann@example.org';

/** Ask for a code for Ann (from an address, carrying a challenge); answers the challenge */
async function ask(options: Parameters<typeof requestSignInCode>[1] = {}): Promise<string> {
  return (await requestSignInCode(ANN, options)).challenge;
}

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
    const { challenge } = await requestSignInCode('  Ann@Example.org ');
    expect(outbox[0].to).toBe(ANN);
    const user = await verifySignInCode(ANN, lastCode(), challenge);
    expect(user).toMatchObject({ email: ANN, name: null });
  });

  it('signs an existing user in to the same account', async () => {
    const challenge = await ask();
    const one = await verifySignInCode(ANN, lastCode(), challenge);
    const again = await ask();
    const two = await verifySignInCode(ANN, lastCode(), again);
    expect(two.id).toBe(one.id);
  });

  it('accepts a code once', async () => {
    const challenge = await ask();
    const code = lastCode();
    await verifySignInCode(ANN, code, challenge);
    await expect(verifySignInCode(ANN, code, challenge)).rejects.toMatchObject({ status: 401 });
  });

  it('accepts a code only with the challenge its request was answered with', async () => {
    const challenge = await ask();
    const code = lastCode();
    await expect(verifySignInCode(ANN, code, undefined)).rejects.toMatchObject({ status: 401 });
    await expect(verifySignInCode(ANN, code, 'someone-elses')).rejects.toMatchObject({
      status: 401,
    });
    await expect(verifySignInCode(ANN, code, challenge)).resolves.toMatchObject({ email: ANN });
  });

  it("replaces a browser's earlier code with its new one, and not another browser's", async () => {
    const mine = await ask();
    const first = lastCode();
    // "Send a new code" carries the challenge on
    expect(await ask({ challenge: mine })).toBe(mine);
    const second = lastCode();
    await expect(verifySignInCode(ANN, first, mine)).rejects.toBeInstanceOf(SignInError);

    // Someone else asking for Ann's email doesn't cancel the code she is about to type
    const theirs = await ask({ from: '198.51.100.7' });
    expect(theirs).not.toBe(mine);
    await expect(verifySignInCode(ANN, second, mine)).resolves.toMatchObject({ email: ANN });
  });

  it("doesn't carry on a challenge this email wasn't answered with", async () => {
    const { challenge: bos } = await requestSignInCode('bo@example.org');
    expect(await ask({ challenge: bos })).not.toBe(bos);
  });

  it("can't have its attempts spent by anyone but the browser that asked", async () => {
    const mine = await ask({ from: '203.0.113.9' });
    const code = lastCode();
    // Someone guessing at Ann's email, with a challenge of their own, spends only their code
    const theirs = await ask({ from: '198.51.100.7' });
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
      await expect(verifySignInCode(ANN, wrong(code), theirs)).rejects.toBeInstanceOf(SignInError);
    }
    const stored = await prisma.signInCode.findFirstOrThrow({
      where: { challengeHash: hashSecret(mine) },
    });
    expect(stored.attempts).toBe(0);
    await expect(verifySignInCode(ANN, code, mine)).resolves.toMatchObject({ email: ANN });
  });

  it('keeps the later code when two requests from one browser overlap', async () => {
    const challenge = await ask({ now: new Date(Date.now() - 5000) });
    const earlier = new Date(Date.now() - 1000);
    const later = new Date(earlier.getTime() + 1);
    // The later request starts first, so it tends to finish first; the earlier one must not
    // then cancel it. (Whether the earlier code survives depends on timing.)
    await Promise.all([ask({ challenge, now: later }), ask({ challenge, now: earlier })]);
    const latest = await prisma.signInCode.findFirstOrThrow({ where: { createdAt: later } });
    expect(latest.consumedAt).toBeNull();

    const code = outbox.find((m) => hashSecret(m.code) === latest.codeHash)!.code;
    await expect(verifySignInCode(ANN, code, challenge)).resolves.toBeTruthy();
  });

  it('cancels neither code when two overlapping requests share a time', async () => {
    const challenge = await ask();
    await prisma.signInCode.deleteMany();
    const now = new Date(Date.now() - 1000);
    await Promise.all([ask({ challenge, now }), ask({ challenge, now })]);
    expect(await prisma.signInCode.count({ where: { consumedAt: null } })).toBe(2);
  });

  it('keeps the earlier code when a new one fails to send', async () => {
    const challenge = await ask();
    const first = lastCode();
    // Production without an email provider fails to send
    process.env.NODE_ENV = 'production';
    await expect(ask({ challenge })).rejects.toMatchObject({ status: 502 });
    process.env.NODE_ENV = 'test';
    await expect(verifySignInCode(ANN, first, challenge)).resolves.toMatchObject({ email: ANN });
  });

  it('rejects an expired code', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const challenge = await ask({ now: start });
    const later = new Date(start.getTime() + 16 * 60 * 1000);
    await expect(verifySignInCode(ANN, lastCode(), challenge, later)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('gives up on a code after too many wrong guesses', async () => {
    const challenge = await ask();
    const code = lastCode();
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await expect(verifySignInCode(ANN, wrong(code), challenge)).rejects.toMatchObject({
        status: 401,
      });
    }
    await expect(verifySignInCode(ANN, wrong(code), challenge)).rejects.toMatchObject({
      status: 429,
    });
    // Even the right code no longer works
    await expect(verifySignInCode(ANN, code, challenge)).rejects.toMatchObject({ status: 401 });
    // A new code starts again
    await ask({ challenge });
    await expect(verifySignInCode(ANN, lastCode(), challenge)).resolves.toMatchObject({
      email: ANN,
    });
  });

  it('counts concurrent wrong guesses against the attempt limit', async () => {
    const challenge = await ask();
    const code = lastCode();
    const guesses = await Promise.allSettled(
      Array.from({ length: MAX_ATTEMPTS + 10 }, () =>
        verifySignInCode(ANN, wrong(code), challenge),
      ),
    );
    for (const guess of guesses) {
      expect(guess.status).toBe('rejected');
      expect((guess as PromiseRejectedResult).reason).toBeInstanceOf(SignInError);
    }
    const stored = await prisma.signInCode.findFirstOrThrow();
    expect(stored.attempts).toBeLessThanOrEqual(MAX_ATTEMPTS);
    await expect(verifySignInCode(ANN, code, challenge)).rejects.toBeInstanceOf(SignInError);
  });

  it('limits how many codes an email can request in an hour from one address', async () => {
    expect(MAX_CODES_PER_EMAIL_FROM_ADDRESS).toBe(5);
    for (let i = 0; i < MAX_CODES_PER_EMAIL_FROM_ADDRESS; i++) await ask({ from: '203.0.113.9' });
    await expect(ask({ from: '203.0.113.9' })).rejects.toMatchObject({
      status: 429,
      message: 'Too many codes requested. Try again in an hour.',
    });
    // Someone else's requests don't lock Ann out: from her own network she still gets a code
    const challenge = await ask({ from: '198.51.100.7' });
    await expect(verifySignInCode(ANN, lastCode(), challenge)).resolves.toMatchObject({
      email: ANN,
    });
  });

  it('counts an IPv6 /64 as one address', async () => {
    expect(addressKey('2001:db8:1:2::a')).toBe(addressKey('2001:db8:1:2:ffff::b'));
    expect(addressKey('2001:db8:1:3::a')).not.toBe(addressKey('2001:db8:1:2::a'));
    for (let i = 0; i < MAX_CODES_PER_EMAIL_FROM_ADDRESS; i++) {
      await ask({ from: `2001:db8:1:2::${i + 1}` });
    }
    await expect(ask({ from: '2001:db8:1:2::99' })).rejects.toMatchObject({ status: 429 });
  });

  it('keys addresses with the server secret, not a plain hash', async () => {
    const before = addressKey('203.0.113.9');
    expect(before).not.toBe(hashSecret('address:203.0.113.9'));
    process.env.SERVER_SECRET = 'another-secret-another-secret-another';
    try {
      expect(addressKey('203.0.113.9')).not.toBe(before);
    } finally {
      delete process.env.SERVER_SECRET;
    }
  });

  it('limits how many codes an email can request in an hour from all addresses', async () => {
    expect(MAX_CODES_PER_EMAIL).toBe(50);
    await prisma.signInCode.createMany({
      data: Array.from({ length: MAX_CODES_PER_EMAIL }, (_, i) => ({
        email: ANN,
        codeHash: 'x',
        expiresAt: new Date(Date.now() + 60_000),
        requestedFrom: addressKey(`203.0.113.${Math.floor(i / 5)}`),
      })),
    });
    await expect(ask({ from: '198.51.100.7' })).rejects.toMatchObject({ status: 429 });
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
    await expect(ask({ from: '203.0.113.9' })).rejects.toMatchObject({
      status: 429,
      message: 'Too many sign-in emails from this network. Try again in an hour.',
    });
    expect(outbox).toHaveLength(0);
    // Another network is unaffected
    await ask({ from: '198.51.100.7' });
    expect(outbox).toHaveLength(1);
  });

  it('rejects a malformed email or code', async () => {
    await expect(requestSignInCode('not-an-email')).rejects.toMatchObject({ status: 400 });
    await expect(verifySignInCode(ANN, '12ab56', 'x')).rejects.toMatchObject({ status: 400 });
  });

  it('accepts the test code only when test sign-in is enabled', async () => {
    await expect(verifySignInCode('bo@example.org', '000000', undefined)).rejects.toBeInstanceOf(
      SignInError,
    );
    process.env.ENABLE_TEST_AUTH = 'true';
    await expect(verifySignInCode('bo@example.org', '000000', undefined)).resolves.toMatchObject({
      email: 'bo@example.org',
    });
  });

  it('stores codes and challenges only as hashes', async () => {
    const challenge = await ask();
    const stored = await prisma.signInCode.findFirstOrThrow();
    expect(stored.codeHash).toBe(hashSecret(lastCode()));
    expect(stored.challengeHash).toBe(hashSecret(challenge));
  });
});
