/**
 * Requests that change something must come from the app's own pages. The session cookie is
 * SameSite=Lax, which lets a page on any sibling subdomain (another *.scouch.dev site) send it,
 * and Socket.io's CORS setting doesn't stop a cross-site WebSocket. So a state-changing /api
 * request, and the socket handshake, that carry an Origin are refused unless it is the server's
 * own (the page was served from the host the request went to: a phone on the demo laptop's LAN
 * address, 127.0.0.1), the app's (APP_URL) or an allowed development origin. Without an Origin
 * (curl, a server, a native client) they pass: browsers always send one with these requests.
 */

import type { RequestHandler } from 'express';

export type AllowedOrigin = string | RegExp;

/** Whether an Origin header names an allowed origin ("null", from a sandboxed page, never does) */
export function originAllowed(origin: string, allowed: readonly AllowedOrigin[]): boolean {
  return allowed.some((entry) =>
    typeof entry === 'string' ? entry === origin : entry.test(origin),
  );
}

/**
 * Whether the Origin is the request's own host: the page was served by this server, at the
 * address the request went to. A browser sets Host itself, so another site's page can't match.
 */
export function sameOrigin(origin: string, host: string | undefined): boolean {
  if (!host) return false;
  try {
    return new URL(origin).host === host.toLowerCase();
  } catch {
    return false;
  }
}

/** Whether a request with this Origin header (or none), sent to this Host, may go on */
export function requestOriginAllowed(
  origin: string | undefined,
  host: string | undefined,
  allowed: readonly AllowedOrigin[],
): boolean {
  return origin === undefined || sameOrigin(origin, host) || originAllowed(origin, allowed);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const CROSS_SITE = 'This request must come from Robbie itself';

/** Refuse (403) a state-changing request from another site's page */
export function originCheck(allowed: readonly AllowedOrigin[]): RequestHandler {
  return function originCheck(req, res, next) {
    if (
      SAFE_METHODS.has(req.method) ||
      requestOriginAllowed(req.headers.origin, req.headers.host, allowed)
    ) {
      next();
      return;
    }
    res.status(403).json({ error: CROSS_SITE });
  };
}
