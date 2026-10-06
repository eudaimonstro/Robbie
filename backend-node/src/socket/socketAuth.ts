import type { Socket } from 'socket.io';
import { findSession } from '../auth/sessionService.js';
import { SESSION_COOKIE } from '../auth/authenticate.js';
import { ACCEPT_THE_TERMS, TERMS_NOT_ACCEPTED, hasAcceptedTerms } from '../auth/terms.js';
import { logger } from '../middleware/logger.js';

/** One cookie's value from a Cookie header, or null if it is missing or badly encoded */
function readCookie(header: string | undefined, name: string): string | null {
  for (const part of header?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join('='));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Socket.io middleware: accept a connection only with a valid session, from the web cookie or
 * a mobile token in the handshake, and record who it is on socket.data
 */
export function socketAuth(find: typeof findSession = findSession) {
  // Socket.io ignores this promise, so nothing may throw out of it: a rejection would be
  // unhandled and stop the server
  return async (socket: Socket, next: (error?: Error) => void) => {
    try {
      const fromHandshake = socket.handshake.auth?.token;
      const token =
        typeof fromHandshake === 'string' && fromHandshake
          ? fromHandshake
          : readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
      if (!token) return next(new Error('Not signed in'));

      const session = await find(token);
      if (!session) return next(new Error('Not signed in'));
      if (!hasAcceptedTerms(session.termsVersion)) {
        // Clients read data.code to send the user to the terms step
        return next(
          Object.assign(new Error(ACCEPT_THE_TERMS), { data: { code: TERMS_NOT_ACCEPTED } }),
        );
      }
      socket.data.userId = session.user.id;
      socket.data.email = session.user.email;
      // Clients ask for a name after the first sign-in; until then show the email
      socket.data.name = session.user.name ?? session.user.email;
      socket.data.sessionId = session.sessionId;
      socket.data.meetingCode = null;
      next();
    } catch (error) {
      logger.error({ err: error }, 'Failed to check a socket session');
      next(new Error('Sign-in is unavailable'));
    }
  };
}
