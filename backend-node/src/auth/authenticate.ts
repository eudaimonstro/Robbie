import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { findSession, type SessionUser } from './sessionService.js';
import { logger } from '../middleware/logger.js';

export const SESSION_COOKIE = 'session';

declare module 'express-serve-static-core' {
  interface Request {
    /** The signed-in user, set by authenticate */
    user?: SessionUser;
    /** The session in use, set by authenticate */
    sessionId?: string;
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

/** The session token a request carries: a bearer token (mobile), else the cookie (web) */
export function sessionTokenFrom(
  cookie: string | undefined,
  authorization: string | undefined,
): string | null {
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7).trim() || null;
  return cookie || null;
}

/** Require a signed-in user: 401 without a valid session, 503 if it can't be checked */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = sessionTokenFrom(req.cookies?.[SESSION_COOKIE], req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  try {
    const session = await findSession(token);
    if (!session) return res.status(401).json({ error: 'Not signed in' });
    req.user = session.user;
    req.sessionId = session.sessionId;
    next();
  } catch (error) {
    logger.error({ err: error }, 'Failed to check the session');
    res.status(503).json({ error: 'Sign-in is unavailable. Try again.' });
  }
}
