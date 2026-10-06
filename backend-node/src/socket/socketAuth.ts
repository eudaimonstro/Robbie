import type { Socket } from 'socket.io';
import { findSession } from '../auth/sessionService.js';
import { SESSION_COOKIE } from '../auth/authenticate.js';
import { logger } from '../middleware/logger.js';

/** One cookie's value from a Cookie header */
function readCookie(header: string | undefined, name: string): string | null {
  for (const part of header?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/**
 * Socket.io middleware: accept a connection only with a valid session, from the web cookie or
 * a mobile token in the handshake, and record who it is on socket.data
 */
export function socketAuth(find: typeof findSession = findSession) {
  return async (socket: Socket, next: (error?: Error) => void) => {
    const fromHandshake = socket.handshake.auth?.token;
    const token =
      typeof fromHandshake === 'string' && fromHandshake
        ? fromHandshake
        : readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    if (!token) return next(new Error('Not signed in'));

    try {
      const session = await find(token);
      if (!session) return next(new Error('Not signed in'));
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
