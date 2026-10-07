import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import { roomManager } from './roomManager.js';
import { applyAction } from './stateManager.js';
import { emitState } from './statePublisher.js';
import { runEvent } from './socketEvents.js';

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
 * Mark a member absent who is present because of a device that is gone. Writes to a meeting
 * are queued, so this checks again when it is applied: a member who has reconnected, or whom
 * the chair has marked present, stays present.
 */
export async function markDeviceAbsent(
  io: TypedServer,
  meetingCode: string,
  member: { id: number; name: string; role: SocketData['role'] },
): Promise<void> {
  const timestamp = new Date().toISOString();
  const result = await applyAction(
    meetingCode,
    { type: 'SET_MEMBER_PRESENCE', memberId: member.id, present: false, timestamp },
    (state) => {
      if (roomManager.isMemberConnected(meetingCode, member.id)) {
        return { valid: false, error: 'Member reconnected' };
      }
      const current = state.members.find((m) => m.id === member.id);
      if (!current?.present || current.presentBy === 'chair') {
        return { valid: false, error: 'Not present on a device' };
      }
      return { valid: true };
    },
  );
  if (!result.success) return;

  emitState(io, meetingCode, {
    state: result.state,
    stateVersion: result.stateVersion,
    triggeredBy: { actionType: 'MEMBER_LEFT', userId: member.id },
  });
  io.to(`meeting:${meetingCode}`).emit('MEMBER_LEFT', {
    member: { id: member.id, name: member.name, role: member.role, present: false },
    timestamp,
  });
}

/**
 * Handle a socket leaving its meeting. A dropped connection ('disconnect') starts the member's
 * grace period (see PRESENCE_GRACE_MS) and leaves socket.data alone, since connection state
 * recovery may bring the socket back with it; leaving on purpose ('leave': LEAVE_MEETING, or
 * joining another meeting) marks the member absent at once.
 */
export async function handleDisconnect(
  socket: TypedSocket,
  io: TypedServer,
  reason: 'disconnect' | 'leave' = 'leave',
): Promise<void> {
  const meetingCode = socket.data.meetingCode;
  if (!meetingCode || !socket.data.userId) return;
  const roomName = `meeting:${meetingCode}`;

  // The socket's room entry goes whatever the socket is now (a display may have been a
  // member's device); a display was never a member, so only a member's presence follows
  roomManager.removeMember(meetingCode, socket.id);
  if (!socket.data.display) {
    const member = { id: socket.data.userId, name: socket.data.name, role: socket.data.role };

    // Another connection of the same member keeps them present
    if (!roomManager.isMemberConnected(meetingCode, member.id)) {
      if (reason === 'disconnect') {
        roomManager.startGrace(meetingCode, member.id, () =>
          runEvent('presence grace', markDeviceAbsent(io, meetingCode, member)),
        );
      } else {
        roomManager.cancelGrace(meetingCode, member.id);
        await markDeviceAbsent(io, meetingCode, member);
      }
    }
  }

  // The user's rate limit buckets stay: removing them here gave anyone who left and joined
  // again a fresh allowance. The limiters' periodic cleanup frees idle buckets.

  if (reason === 'leave') {
    socket.leave(roomName);
    // The socket leaves the meeting but stays signed in (its identity came from its session)
    socket.data.meetingCode = null;
    socket.data.role = null as unknown as SocketData['role'];
    socket.data.display = false;
  }
}
