import { Router, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
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
import { disconnectSessionSockets, disconnectUserSockets } from '../socket/sessionSockets.js';

export const authRouter = Router();

// Per-IP limits on top of the per-email limits in signInService. Tests sign in many times from
// one address, so the per-IP limits are off under test.
const skipInTests = () => process.env.NODE_ENV === 'test';

const requestCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: skipInTests,
  message: { error: 'Too many requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
}) as unknown as RequestHandler;

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: skipInTests,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
}) as unknown as RequestHandler;

const requestCodeBody = z.object({ email: z.string().max(254) });
const verifyBody = z.object({
  email: z.string().max(254),
  code: z.string().max(10),
  client: z.enum(['web', 'mobile']).default('web'),
});
const updateMeBody = z.object({ name: z.string().trim().min(2).max(100) });

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
      await requestSignInCode(req.body.email);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, 'Failed to send a sign-in code');
    }
  },
);

authRouter.post('/verify', verifyLimiter, validate({ body: verifyBody }), async (req, res) => {
  try {
    const user = await verifySignInCode(req.body.email, req.body.code);
    const session = await createSession(user.id, req.body.client);
    // Mobile keeps the token in its secure store; web gets it only as an httpOnly cookie
    if (req.body.client === 'mobile') {
      return res.json({ user, token: session.token });
    }
    res.cookie(SESSION_COOKIE, session.token, {
      ...sessionCookieOptions(),
      maxAge: SESSION_LIFETIME_MS,
    });
    res.json({ user });
  } catch (error) {
    sendError(res, error, 'Failed to sign in');
  }
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

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
