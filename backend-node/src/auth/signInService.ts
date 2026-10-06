import { prisma } from '../db/prisma.js';
import { sendSignInCode } from './emailService.js';
import { hashSecret, newSignInCode } from './tokens.js';
import type { SessionUser } from './sessionService.js';

export const CODE_LIFETIME_MS = 15 * 60 * 1000;
export const MAX_CODES_PER_HOUR = 5;
export const MAX_ATTEMPTS = 5;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^\d{6}$/;
const WRONG_CODE = 'That code is wrong or has expired';
const TOO_MANY_ATTEMPTS = 'Too many attempts. Request a new code.';

/** A sign-in failure with the HTTP status to answer with */
export class SignInError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SignInError';
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Test sign-in: outside production, ENABLE_TEST_AUTH=true makes a fixed code sign in any email
function isTestCode(code: string): boolean {
  return (
    process.env.ENABLE_TEST_AUTH === 'true' &&
    process.env.NODE_ENV !== 'production' &&
    code === (process.env.TEST_VERIFICATION_CODE || '000000')
  );
}

/** Email a new sign-in code. The answer is the same whether or not the email has an account. */
export async function requestSignInCode(rawEmail: string, now: Date = new Date()): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new SignInError(400, 'Enter a valid email address');
  }

  const recent = await prisma.signInCode.count({
    where: { email, createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } },
  });
  if (recent >= MAX_CODES_PER_HOUR) {
    throw new SignInError(429, 'Too many codes requested. Try again in an hour.');
  }

  const code = newSignInCode();
  const record = await prisma.signInCode.create({
    data: {
      email,
      codeHash: hashSecret(code),
      createdAt: now,
      expiresAt: new Date(now.getTime() + CODE_LIFETIME_MS),
    },
  });

  try {
    await sendSignInCode(email, code);
  } catch {
    await prisma.signInCode.delete({ where: { id: record.id } });
    throw new SignInError(502, "We couldn't send the email. Try again.");
  }

  // The new code replaces earlier ones, once it has been sent: a failed send leaves the earlier
  // code usable. Only codes created before this one, so two overlapping requests can't cancel
  // each other's codes. The later one always survives. Two codes created at the same time both
  // stay unused, but only one of them signs in, since verify checks the newest code.
  await prisma.signInCode.updateMany({
    where: { email, consumedAt: null, createdAt: { lt: record.createdAt } },
    data: { consumedAt: now },
  });
}

/** Check a code and return the user, created on first sign-in */
export async function verifySignInCode(
  rawEmail: string,
  rawCode: string,
  now: Date = new Date(),
): Promise<SessionUser> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.trim();
  if (!CODE_PATTERN.test(code)) throw new SignInError(400, 'The code is 6 digits');

  if (!isTestCode(code)) {
    const record = await prisma.signInCode.findFirst({
      where: { email, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new SignInError(401, WRONG_CODE);

    // Claim an attempt before comparing, in one conditional update, so concurrent guesses can't
    // get past the limit: the database lets at most MAX_ATTEMPTS of them through
    const claimed = await prisma.signInCode.updateMany({
      where: { id: record.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
      // Out of attempts, or consumed (or removed) since it was read
      const current = await prisma.signInCode.findUnique({ where: { id: record.id } });
      if (current && current.attempts >= MAX_ATTEMPTS)
        throw new SignInError(429, TOO_MANY_ATTEMPTS);
      throw new SignInError(401, WRONG_CODE);
    }

    if (record.codeHash !== hashSecret(code)) {
      const current = await prisma.signInCode.findUnique({ where: { id: record.id } });
      if (current && current.attempts >= MAX_ATTEMPTS) {
        await prisma.signInCode.updateMany({
          where: { id: record.id, consumedAt: null },
          data: { consumedAt: now },
        });
        throw new SignInError(429, TOO_MANY_ATTEMPTS);
      }
      throw new SignInError(401, WRONG_CODE);
    }

    // Consume only if still unconsumed, so two simultaneous uses can't both succeed
    const consumed = await prisma.signInCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count === 0) throw new SignInError(401, WRONG_CODE);
  }

  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
    select: { id: true, email: true, name: true },
  });
}
