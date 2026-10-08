import type { SocketData } from '@robbie-bylawyer/shared/types/socket';
import { liveSessionIds } from '../auth/sessionService.js';
import { getIoInstance } from './ioInstance.js';

/** How often the server checks its open sockets' sessions (see disconnectSocketsWithoutSession) */
export const SOCKET_SESSION_CHECK_MS = 60 * 1000;

async function disconnectWhere(match: (data: SocketData) => boolean): Promise<void> {
  const io = getIoInstance();
  if (!io) return;
  for (const socket of await io.fetchSockets()) {
    if (match(socket.data)) socket.disconnect(true);
  }
}

/** Close the sockets of a session that has just been signed out */
export function disconnectSessionSockets(sessionId: string): Promise<void> {
  return disconnectWhere((data) => data.sessionId === sessionId);
}

/** Close every socket of a user (sign out everywhere) */
export function disconnectUserSockets(userId: number): Promise<void> {
  return disconnectWhere((data) => data.userId === userId);
}

/**
 * Close every socket whose session has ended outside this process: deleted or its user suspended
 * by the operator's handleReport script, which can't reach this server's sockets, or expired.
 * A socket checks its session only when it connects, so the server runs this every
 * SOCKET_SESSION_CHECK_MS. Returns how many sockets it closed.
 */
export async function disconnectSocketsWithoutSession(
  findLive: (sessionIds: string[]) => Promise<Set<string>> = liveSessionIds,
): Promise<number> {
  const io = getIoInstance();
  if (!io) return 0;
  const sockets = await io.fetchSockets();
  const sessionIds = [...new Set(sockets.map((socket) => socket.data.sessionId).filter(Boolean))];
  if (sessionIds.length === 0) return 0;
  const live = await findLive(sessionIds);
  let closed = 0;
  for (const socket of sockets) {
    if (socket.data.sessionId && !live.has(socket.data.sessionId)) {
      socket.disconnect(true);
      closed++;
    }
  }
  return closed;
}
