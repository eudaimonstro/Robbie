import type { SocketData } from '@robbie-bylawyer/shared/types/socket';
import { getIoInstance } from './ioInstance.js';

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
