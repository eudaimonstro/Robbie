/**
 * Per-user limits on what a signed-in account can make the server do: writes in general, the
 * heavy ones (imports, uploads, new versions and organizations) and claiming meeting codes.
 * Any free account owns an organization of its own, so without these one account could fill
 * the disk and the database the HOAs' live meetings share. They run after authenticate (they
 * key on req.user). Tests write a great deal as one user, so they are off under NODE_ENV=test
 * (a test turns them on by changing it), as the sign-in limits are.
 */

import type { Request, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

const MINUTE_MS = 60 * 1000;

/** State-changing requests per user in WRITE_WINDOW_MS: far above a secretary's autosaving */
export const WRITE_LIMIT = 600;
export const WRITE_WINDOW_MS = 15 * MINUTE_MS;
/** Imports, uploads, new versions and new organizations per user in an hour */
export const HEAVY_WRITE_LIMIT = 60;
/** Meetings scheduled (meeting codes claimed) per user in an hour */
export const MEETING_CODE_LIMIT = 20;
const HOUR_MS = 60 * MINUTE_MS;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function perUser(options: {
  windowMs: number;
  limit: number;
  message: string;
  skip?: (req: Request) => boolean;
}): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    keyGenerator: (req) => `user:${req.user?.id ?? 'none'}`,
    skip: (req) => process.env.NODE_ENV === 'test' || (options.skip?.(req) ?? false),
    message: { error: options.message },
    standardHeaders: true,
    legacyHeaders: false,
  }) as unknown as RequestHandler;
}

/** Every state-changing /api request (GET, HEAD and OPTIONS pass) */
export const writeLimiter = perUser({
  windowMs: WRITE_WINDOW_MS,
  limit: WRITE_LIMIT,
  message: 'Too many changes in a short time. Wait a few minutes and try again.',
  skip: (req) => SAFE_METHODS.has(req.method),
});

/** Imports, uploads, new versions and new organizations */
export const heavyWriteLimiter = perUser({
  windowMs: HOUR_MS,
  limit: HEAVY_WRITE_LIMIT,
  message: 'Too many imports and uploads in an hour. Try again later.',
});

/** Scheduling meetings, which claims meeting codes */
export const meetingCodeLimiter = perUser({
  windowMs: HOUR_MS,
  limit: MEETING_CODE_LIMIT,
  message: 'Too many meetings scheduled in an hour. Try again later.',
});
