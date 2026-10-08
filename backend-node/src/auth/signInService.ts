import { prisma } from '../db/prisma.js';
import { acceptPendingInvites } from '../orgs/membershipService.js';
import { randomBytes, randomInt } from 'node:crypto';
import { isIP } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { ipKeyGenerator } from 'express-rate-limit';
import { canSendEmail, sendSignInCode } from './emailService.js';
import { hashSecret, newSignInCode } from './tokens.js';
import { normalizeEmail } from './normalizeEmail.js';
import { keyedHash } from './serverSecret.js';
import type { SessionUser } from './sessionService.js';

/**
 * Sign-in by emailed code, bound to the browser that asked. A code request is answered with a
 * challenge (random, kept by the browser; only its hash is stored), and verify needs the email,
 * the code and that challenge. So only the browser that asked can use a code or spend its wrong
 * guesses: nobody else can lock a person out by guessing, or cancel the code they are about to
 * type by asking for another. A new request carrying the browser's challenge ("send a new code")
 * replaces that browser's earlier code; codes asked for elsewhere stay as they are.
 */

export const CODE_LIFETIME_MS = 15 * 60 * 1000;
/** Wrong guesses a code takes before it stops working; a new code starts again */
export const MAX_ATTEMPTS = 5;

/**
 * Codes an email can be sent in an hour from one network address (an IPv6 /64): the limit that
 * applies to the person themselves
 */
export const MAX_CODES_PER_EMAIL_FROM_ADDRESS = 5;
/**
 * Codes an email can be sent in an hour from all addresses. High enough that filling it to keep
 * the chair from getting a code takes ten networks (the per-address limit does the everyday
 * limiting), and still a ceiling on guessing: 50 codes of 5 guesses is 250 of a million an hour.
 */
export const MAX_CODES_PER_EMAIL = 50;
/**
 * Sign-in emails one network address can have sent in an hour, to any addresses: room for a
 * clubhouse of homeowners on the venue's Wi-Fi, not for spraying the email provider's quota
 */
export const MAX_EMAILS_PER_ADDRESS = 200;
const HOUR_MS = 60 * 60 * 1000;

const TOO_MANY_CODES = 'Too many codes requested. Try again in an hour.';
const TOO_MANY_FROM_ADDRESS = 'Too many sign-in emails from this network. Try again in an hour.';

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

export { normalizeEmail };

// Test sign-in: outside production, ENABLE_TEST_AUTH=true makes a fixed code sign in any email
function isTestCode(code: string): boolean {
  return (
    process.env.ENABLE_TEST_AUTH === 'true' &&
    process.env.NODE_ENV !== 'production' &&
    code === (process.env.TEST_VERIFICATION_CODE || '000000')
  );
}

/** Whether the account with this (normalized) email is suspended (see handleReport) */
/**
 * How long a suspended account's code request waits before answering, in milliseconds: about
 * as long as a send to the email provider takes, so the answer's timing doesn't single it out
 */
export const SUSPENDED_ANSWER_DELAY_MS = { min: 150, max: 700 };

// Whether the latest send to the email provider failed: a suspended account's request fails
// too then, as anyone's would
let lastSendFailed = false;

/** Stand in for a send to a suspended account: as long, and failing when sends are failing */
async function answerAsASendWould(): Promise<void> {
  await sleep(randomInt(SUSPENDED_ANSWER_DELAY_MS.min, SUSPENDED_ANSWER_DELAY_MS.max + 1));
  if (!canSendEmail() || lastSendFailed) throw new Error('Sending is failing');
}

async function isSuspended(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email }, select: { suspendedAt: true } });
  return Boolean(user?.suspendedAt);
}

/**
 * A network address as the codes record it: a keyed hash (HMAC under SERVER_SECRET), not the
 * address, of the address as the limits count it: an IPv4 address, or an IPv6 address's /64,
 * since one device or home holds a whole /64
 */
export function addressKey(address: string): string {
  const counted = isIP(address) ? ipKeyGenerator(address, 64) : address;
  return keyedHash(`address:${counted}`);
}

/** What a code request answers: the challenge the browser keeps and sends with the code */
export interface CodeRequested {
  challenge: string;
}

const newChallenge = () => randomBytes(32).toString('base64url');

/**
 * Email a new sign-in code. The answer is the same whether or not the email has an account, and
 * for a suspended account, which goes through the same steps but is never sent the code: its
 * answer waits about as long as a send, and fails when sends are failing.
 *
 * `from` is the requester's network address, for the hourly limits: per email from that
 * address, per email from all addresses, and per address to all emails. A failed send isn't
 * counted (its code is removed).
 */
export async function requestSignInCode(
  rawEmail: string,
  options: {
    /** The requester's network address */
    from?: string;
    /** The challenge of this browser's earlier request, if any: the new code replaces its code */
    challenge?: string;
    now?: Date;
  } = {},
): Promise<CodeRequested> {
  const { from = 'unknown', now = new Date() } = options;
  const email = normalizeEmail(rawEmail);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new SignInError(400, 'Enter a valid email address');
  }

  const requestedFrom = addressKey(from);
  const hourAgo = { gt: new Date(now.getTime() - HOUR_MS) };
  const [fromAddress, forEmail, toAnyone] = await Promise.all([
    prisma.signInCode.count({ where: { email, requestedFrom, createdAt: hourAgo } }),
    prisma.signInCode.count({ where: { email, createdAt: hourAgo } }),
    prisma.signInCode.count({ where: { requestedFrom, createdAt: hourAgo } }),
  ]);
  if (toAnyone >= MAX_EMAILS_PER_ADDRESS) throw new SignInError(429, TOO_MANY_FROM_ADDRESS);
  if (fromAddress >= MAX_CODES_PER_EMAIL_FROM_ADDRESS || forEmail >= MAX_CODES_PER_EMAIL) {
    throw new SignInError(429, TOO_MANY_CODES);
  }

  // The browser's earlier challenge carries on when it is one this email was answered with;
  // anything else gets a new one
  const earlier = options.challenge
    ? await prisma.signInCode.findFirst({
        where: { email, challengeHash: hashSecret(options.challenge) },
        select: { id: true },
      })
    : null;
  const challenge = earlier ? options.challenge! : newChallenge();
  const challengeHash = hashSecret(challenge);

  const code = newSignInCode();
  const record = await prisma.signInCode.create({
    data: {
      email,
      codeHash: hashSecret(code),
      createdAt: now,
      expiresAt: new Date(now.getTime() + CODE_LIFETIME_MS),
      requestedFrom,
      challengeHash,
    },
  });

  try {
    if (await isSuspended(email)) {
      await answerAsASendWould();
    } else {
      try {
        await sendSignInCode(email, code);
        lastSendFailed = false;
      } catch (error) {
        lastSendFailed = true;
        throw error;
      }
    }
  } catch {
    await prisma.signInCode.delete({ where: { id: record.id } });
    throw new SignInError(502, "We couldn't send the email. Try again.");
  }

  // The new code replaces this browser's earlier ones (same challenge), once it has been sent:
  // a failed send leaves the earlier code usable. Only codes created before this one, so two
  // overlapping requests can't cancel each other's codes. Codes other browsers asked for stay.
  await prisma.signInCode.updateMany({
    where: { email, challengeHash, consumedAt: null, createdAt: { lt: record.createdAt } },
    data: { consumedAt: now },
  });
  return { challenge };
}

/**
 * Check a code, with the challenge its request was answered with, and return the user, created
 * on first sign-in. Only the newest live code of that challenge is checked, and only its
 * attempts are spent. A suspended user is refused. (The test code needs no challenge.)
 */
export async function verifySignInCode(
  rawEmail: string,
  rawCode: string,
  challenge: string | undefined,
  now: Date = new Date(),
): Promise<SessionUser> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.trim();
  if (!CODE_PATTERN.test(code)) throw new SignInError(400, 'The code is 6 digits');

  if (!isTestCode(code)) {
    const record = challenge
      ? await prisma.signInCode.findFirst({
          where: {
            email,
            challengeHash: hashSecret(challenge),
            consumedAt: null,
            expiresAt: { gt: now },
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;
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

  // A suspended account gets the answer a wrong code gets, so the refusal doesn't confirm it
  if (await isSuspended(email)) throw new SignInError(401, WRONG_CODE);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: {},
      create: { email },
      select: { id: true, email: true, name: true },
    });
    // Additions by email that were waiting for this address become memberships
    await acceptPendingInvites(tx, user, now);
    return user;
  });
}
