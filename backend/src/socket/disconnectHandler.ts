import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData
} from '@robbie/shared/types/socket';
import { roomManager } from './roomManager.js';
import { applyAction } from './stateManager.js';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

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
      // Update member presence in state
      const presenceResult = await applyAction(meetingCode, {
        type: 'SET_MEMBER_PRESENCE',
        memberId: socket.data.userId,
        present: false,
        timestamp
      });

      // Broadcast state update if presence changed
      if (presenceResult.success && presenceResult.state) {
        io.to(roomName).emit('STATE_UPDATE', {
          state: presenceResult.state,
          stateVersion: presenceResult.stateVersion!,
          triggeredBy: { actionType: 'MEMBER_LEFT', userId: socket.data.userId }
        });
      }
    }

    // Notify others of member left
    socket.to(roomName).emit('MEMBER_LEFT', {
      member: {
        id: socket.data.userId,
        name: socket.data.name,
        role: socket.data.role,
        present: stillConnected
      },
      timestamp
    });

    socket.leave(roomName);
    socket.data.meetingCode = null;
  }
}
