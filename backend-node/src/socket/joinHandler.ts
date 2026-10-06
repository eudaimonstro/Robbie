import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  JoinMeetingPayload,
  JoinMeetingResponse,
} from '@robbie-bylawyer/shared/types/socket';
import { roomManager } from './roomManager.js';
import { getStorage } from '../db/meetingStorage.js';
import { joinRateLimiter } from './rateLimiter.js';
import { applyAction } from './stateManager.js';
import { markDisconnectedMembersAbsent } from './presenceReconciler.js';
import { handleDisconnect } from './disconnectHandler.js';
import { logger } from '../middleware/logger.js';

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
 * Handle JOIN_MEETING socket event
 */
export async function handleJoinMeeting(
  socket: TypedSocket,
  io: TypedServer,
  data: JoinMeetingPayload,
  callback: (response: JoinMeetingResponse) => void,
): Promise<void> {
  try {
    // Replaced in Task 9 by connection-level authentication
    const decoded = socket.data.userId
      ? {
          userId: socket.data.userId,
          email: socket.data.email,
          name: socket.data.name,
          meetingCode: data.meetingCode,
        }
      : null;
    if (!decoded) {
      callback({ success: false, error: 'Not signed in' });
      return;
    }

    // Rate limit join attempts per user
    if (!joinRateLimiter.consume(decoded.userId)) {
      const retryAfter = joinRateLimiter.getRetryAfter(decoded.userId);
      callback({
        success: false,
        error: `Too many join attempts. Please wait ${Math.ceil(retryAfter / 1000)} seconds.`,
      });
      return;
    }

    // Verify meeting code matches token
    if (decoded.meetingCode !== data.meetingCode) {
      callback({ success: false, error: 'Token not valid for this meeting' });
      return;
    }

    // A socket already in another meeting leaves it first, as on disconnect; otherwise it
    // kept receiving that meeting's updates and its member stayed present there
    if (socket.data.meetingCode && socket.data.meetingCode !== data.meetingCode) {
      await handleDisconnect(socket, io);
    }

    // Get or create meeting
    const storage = getStorage();
    const meeting = await storage.getOrCreateMeeting(data.meetingCode);

    // Get user role - check if user is a persistent admin via environment config
    const odUserId = String(decoded.userId);
    let role = await storage.getParticipantRole(data.meetingCode, odUserId);
    if (!role) {
      // Check if user email is in ADMIN_EMAILS list
      const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0);
      const isAdmin = adminEmails.includes(decoded.email.toLowerCase());
      role = isAdmin ? 'admin' : 'member';
      await storage.setParticipantRole(data.meetingCode, odUserId, role);
    }

    // Store socket data
    socket.data.userId = decoded.userId;
    socket.data.email = decoded.email;
    socket.data.name = decoded.name;
    socket.data.meetingCode = data.meetingCode;
    socket.data.role = role;

    // Join the room
    const roomName = `meeting:${data.meetingCode}`;
    socket.join(roomName);
    roomManager.addMember(data.meetingCode, socket.id, {
      id: decoded.userId,
      name: decoded.name,
      role,
      present: true,
    });

    const memberData = { id: decoded.userId, name: decoded.name, role, present: true };
    const timestamp = new Date().toISOString();

    // Add member to state if not already present
    let currentState = meeting.state;
    let currentVersion = meeting.stateVersion;

    if (!currentState.members.some((m) => m.id === decoded.userId)) {
      const addResult = await applyAction(data.meetingCode, {
        type: 'ADD_MEMBER',
        member: memberData,
        timestamp,
      });
      if (addResult.success && addResult.state) {
        currentState = addResult.state;
        currentVersion = addResult.stateVersion!;
      }
    }

    // Set member presence to true
    const presenceResult = await applyAction(data.meetingCode, {
      type: 'SET_MEMBER_PRESENCE',
      memberId: decoded.userId,
      present: true,
      timestamp,
    });
    if (presenceResult.success && presenceResult.state) {
      currentState = presenceResult.state;
      currentVersion = presenceResult.stateVersion!;
    }

    // Members still shown as present with no connection (left over from a server restart)
    // are marked absent, so quorum counts only who is here
    const reconciled = await markDisconnectedMembersAbsent(data.meetingCode, currentState);
    if (reconciled) {
      currentState = reconciled.state;
      currentVersion = reconciled.stateVersion;
    }

    // Notify others of member joined
    socket.to(roomName).emit('MEMBER_JOINED', {
      member: memberData,
      timestamp,
    });

    // Broadcast updated state to all (including the joiner via callback)
    io.to(roomName).emit('STATE_UPDATE', {
      state: currentState,
      stateVersion: currentVersion,
      triggeredBy: { actionType: 'MEMBER_JOINED', userId: decoded.userId },
    });

    callback({
      success: true,
      state: currentState,
      stateVersion: currentVersion,
      members: roomManager.getMembers(data.meetingCode),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, 'Error joining meeting');
    callback({ success: false, error: `Failed to join meeting: ${errorMessage}` });
  }
}
