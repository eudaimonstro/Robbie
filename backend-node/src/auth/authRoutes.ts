import { Router, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import { prisma } from '../db/prisma.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../middleware/logger.js';
import { SignInError, requestSignInCode, verifySignInCode } from './signInService.js';
import {
  SESSION_LIFETIME_MS,
  createSession,
  deleteSessionByToken,
  deleteUserSessions,
} from './sessionService.js';
import {
  SESSION_COOKIE,
  authenticate,
  sessionCookieOptions,
  sessionTokenFrom,
} from './authenticate.js';
import { hasAcceptedTerms } from './terms.js';
import { suggestedNameFor } from '../orgs/membershipService.js';
import { disconnectSessionSockets, disconnectUserSockets } from '../socket/sessionSockets.js';

export const authRouter = Router();

// Per-IP limits on requests, on top of signInService's hourly limits on codes (per email from an
// address, per email, and emails sent per address) and its 5 attempts per code, which are the
// guard against guessing. These only slow one machine spraying many addresses: at a meeting
// every homeowner on the venue's Wi-Fi shares one public address, so they allow a room. Tests
// sign in many times from one address, so they are off under test.
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;
export const REQUEST_CODE_LIMIT_PER_IP = 300;
export const VERIFY_LIMIT_PER_IP = 600;

const skipInTests = () => process.env.NODE_ENV === 'test';

const requestCodeLimiter = rateLimit({
  windowMs: SIGN_IN_WINDOW_MS,
  max: REQUEST_CODE_LIMIT_PER_IP,
  skip: skipInTests,
  message: { error: 'Too many requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
}) as unknown as RequestHandler;

const verifyLimiter = rateLimit({
  windowMs: SIGN_IN_WINDOW_MS,
  max: VERIFY_LIMIT_PER_IP,
  skip: skipInTests,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
}) as unknown as RequestHandler;

// The challenge a code request answers with (see signInService): sent back with "send a new
// code" and with the code
const challenge = z.string().max(100);
const requestCodeBody = z.object({ email: z.string().max(254), challenge: challenge.optional() });
const verifyBody = z.object({
  email: z.string().max(254),
  code: z.string().max(10),
  challenge: challenge.optional(),
  client: z.enum(['web', 'mobile']).default('web'),
});
const updateMeBody = z.object({ name: z.string().trim().min(2).max(100) });
const acceptTermsBody = z.object({ version: z.string().max(40) });

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof SignInError) {
    return res.status(error.status).json({ error: error.message });
  }
  logger.error({ err: error }, fallback);
  res.status(500).json({ error: fallback });
}

authRouter.post(
  '/request-code',
  requestCodeLimiter,
  validate({ body: requestCodeBody }),
  async (req, res) => {
    try {
      const { challenge } = await requestSignInCode(req.body.email, {
        from: req.ip,
        challenge: req.body.challenge,
      });
      res.json({ success: true, challenge });
    } catch (error) {
      sendError(res, error, 'Failed to send a sign-in code');
    }
  },
);

authRouter.post('/verify', verifyLimiter, validate({ body: verifyBody }), async (req, res) => {
  try {
    const user = await verifySignInCode(req.body.email, req.body.code, req.body.challenge);
    const session = await createSession(user.id, req.body.client);
    // Mobile keeps the token in its secure store; web gets it only as an httpOnly cookie
    if (req.body.client === 'mobile') {
      return res.json({ user, token: session.token });
    }
    res.cookie(SESSION_COOKIE, session.token, {
      ...sessionCookieOptions(),
      maxAge: SESSION_LIFETIME_MS,
    });
    // A new user added by email with a name: their name step starts from it
    const suggestedName = await suggestedNameFor(user);
    res.json({ user, ...(suggestedName && { suggestedName }) });
  } catch (error) {
    sendError(res, error, 'Failed to sign in');
  }
});

authRouter.get('/me', authenticate, async (req, res) => {
  try {
    const suggestedName = await suggestedNameFor(req.user!);
    res.json({
      user: req.user,
      termsAccepted: hasAcceptedTerms(req.termsVersion),
      ...(suggestedName && { suggestedName }),
    });
  } catch (error) {
    sendError(res, error, 'Failed to read your session');
  }
});

// Accept the current Terms of Service and Privacy Policy. The client sends the version it
// showed, so a stale page can't accept terms the user never saw.
authRouter.post(
  '/accept-terms',
  authenticate,
  validate({ body: acceptTermsBody }),
  async (req, res) => {
    if (req.body.version !== TERMS_VERSION) {
      return res
        .status(409)
        .json({ error: 'The terms have changed. Reload to see the current terms.' });
    }
    try {
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() },
      });
      res.json({ termsAccepted: true });
    } catch (error) {
      sendError(res, error, 'Failed to record your acceptance');
    }
  },
);

authRouter.patch('/me', authenticate, validate({ body: updateMeBody }), async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { name: req.body.name },
      select: { id: true, email: true, name: true },
    });
    res.json({ user });
  } catch (error) {
    sendError(res, error, 'Failed to update your name');
  }
});

// Sign-out needs no valid session: an expired or unknown one still gets its cookie cleared
authRouter.post('/sign-out', async (req, res) => {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  const token = sessionTokenFrom(req.cookies?.[SESSION_COOKIE], req.headers.authorization);
  try {
    const sessionId = token ? await deleteSessionByToken(token) : null;
    if (sessionId) await disconnectSessionSockets(sessionId);
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, 'Failed to sign out');
  }
});

authRouter.post('/sign-out-everywhere', authenticate, async (req, res) => {
  try {
    await deleteUserSessions(req.user!.id);
    await disconnectUserSockets(req.user!.id);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, 'Failed to sign out');
  }
});
