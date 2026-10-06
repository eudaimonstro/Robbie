import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import { roomManager } from './roomManager.js';
import { applyAction } from './stateManager.js';
import { actionRateLimiter, joinRateLimiter } from './rateLimiter.js';

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Handle socket disconnect and LEAVE_MEETING events
 */
export async function handleDisconnect(socket: TypedSocket, io: TypedServer): Promise<void> {
  if (socket.data.meetingCode && socket.data.userId) {
    const meetingCode = socket.data.meetingCode;
    const roomName = `meeting:${meetingCode}`;
    const timestamp = new Date().toISOString();

    roomManager.removeMember(meetingCode, socket.id);

    // Check if user still has other connections in this meeting
    const stillConnected = roomManager.isMemberConnected(meetingCode, socket.data.userId);

    if (!stillConnected) {
      // Update member presence in state. Writes to a meeting are queued, and a page refresh can
      // reconnect the member before this one runs, so check again when it is applied.
      const userId = socket.data.userId;
      const presenceResult = await applyAction(
        meetingCode,
        { type: 'SET_MEMBER_PRESENCE', memberId: userId, present: false, timestamp },
        () =>
          roomManager.isMemberConnected(meetingCode, userId)
            ? { valid: false, error: 'Member reconnected' }
            : { valid: true },
      );

      // Broadcast state update if presence changed
      if (presenceResult.success && presenceResult.state) {
        io.to(roomName).emit('STATE_UPDATE', {
          state: presenceResult.state,
          stateVersion: presenceResult.stateVersion!,
          triggeredBy: { actionType: 'MEMBER_LEFT', userId: socket.data.userId },
        });
      }
    }

    // Notify others of member left
    socket.to(roomName).emit('MEMBER_LEFT', {
      member: {
        id: socket.data.userId,
        name: socket.data.name,
        role: socket.data.role,
        present: stillConnected,
      },
      timestamp,
    });

    socket.leave(roomName);

    // Clean up rate limiter buckets to prevent memory leaks
    actionRateLimiter.remove(socket.data.userId);
    joinRateLimiter.remove(socket.data.userId);

    // The socket leaves the meeting but stays signed in (its identity came from its session)
    socket.data.meetingCode = null;
    socket.data.role = null as unknown as 'member' | 'chair' | 'admin';
  }
}
