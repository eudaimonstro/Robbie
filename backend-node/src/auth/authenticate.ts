import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { SESSION_LIFETIME_MS, findSession, type SessionUser } from './sessionService.js';
import { logger } from '../middleware/logger.js';

export const SESSION_COOKIE = 'session';

declare module 'express-serve-static-core' {
  interface Request {
    /** The signed-in user, set by authenticate */
    user?: SessionUser;
    /** The session in use, set by authenticate */
    sessionId?: string;
    /** The terms version the signed-in user last accepted, set by authenticate */
    termsVersion?: string | null;
  }
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

/**
 * The session token a request carries, in its session cookie. The cookie is unknown because
 * cookie-parser turns a crafted "j:{...}" value into an object.
 */
export function sessionTokenFrom(cookie: unknown): string | null {
  return typeof cookie === 'string' && cookie ? cookie : null;
}

/** Require a signed-in user: 401 without a valid session, 503 if it can't be checked */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = sessionTokenFrom(req.cookies?.[SESSION_COOKIE]);
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  try {
    const session = await findSession(token);
    if (!session) return res.status(401).json({ error: 'Not signed in' });
    req.user = session.user;
    req.sessionId = session.sessionId;
    req.termsVersion = session.termsVersion;
    // The server extended the session, so extend the cookie too, or the browser drops it
    // 30 days after sign-in however active the user is
    if (session.extended) {
      res.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions(), maxAge: SESSION_LIFETIME_MS });
    }
    next();
  } catch (error) {
    logger.error({ err: error }, 'Failed to check the session');
    res.status(503).json({ error: 'Sign-in is unavailable. Try again.' });
  }
}
