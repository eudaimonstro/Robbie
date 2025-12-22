import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  JoinMeetingPayload,
  JoinMeetingResponse
} from '@robbie/shared/types/socket';
import { verifyToken } from '../auth/authController.js';
import { roomManager } from './roomManager.js';
import { getStorage } from '../db/meetingStorage.js';
import { joinRateLimiter } from './rateLimiter.js';
import { applyAction } from './stateManager.js';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Extract auth_token from cookie header
 */
function getTokenFromCookie(socket: TypedSocket): string | null {
  const cookieHeader = socket.handshake.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  return cookies['auth_token'] || null;
}

/**
 * Handle JOIN_MEETING socket event
 */
export async function handleJoinMeeting(
  socket: TypedSocket,
  io: TypedServer,
  data: JoinMeetingPayload,
  callback: (response: JoinMeetingResponse) => void
): Promise<void> {
  try {
    // Try provided token first, fallback to HttpOnly cookie
    let token = data.token;
    let decoded = token ? verifyToken(token) : null;

    if (!decoded) {
      // Try to get token from HttpOnly cookie
      const cookieToken = getTokenFromCookie(socket);
      if (cookieToken) {
        decoded = verifyToken(cookieToken);
      }
    }

    if (!decoded) {
      callback({ success: false, error: 'Invalid token' });
      return;
    }

    // Rate limit join attempts per user
    if (!joinRateLimiter.consume(decoded.userId)) {
      const retryAfter = joinRateLimiter.getRetryAfter(decoded.userId);
      callback({
        success: false,
        error: `Too many join attempts. Please wait ${Math.ceil(retryAfter / 1000)} seconds.`
      });
      return;
    }

    // Verify meeting code matches token
    if (decoded.meetingCode !== data.meetingCode) {
      callback({ success: false, error: 'Token not valid for this meeting' });
      return;
    }

    // Get or create meeting
    const storage = getStorage();
    const meeting = await storage.getOrCreateMeeting(data.meetingCode);

    // Get user role (first user is chair, others are members)
    const odUserId = String(decoded.userId);
    let role = await storage.getParticipantRole(data.meetingCode, odUserId);
    if (!role) {
      // First person to join becomes chair
      const existingMembers = roomManager.getMembers(data.meetingCode);
      role = existingMembers.length === 0 ? 'chair' : 'member';
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
      present: true
    });

    const memberData = { id: decoded.userId, name: decoded.name, role, present: true };
    const timestamp = new Date().toISOString();

    // Add member to state if not already present
    let currentState = meeting.state;
    let currentVersion = meeting.stateVersion;

    if (!currentState.members.some(m => m.id === decoded.userId)) {
      const addResult = await applyAction(data.meetingCode, {
        type: 'ADD_MEMBER',
        member: memberData,
        timestamp
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
      timestamp
    });
    if (presenceResult.success && presenceResult.state) {
      currentState = presenceResult.state;
      currentVersion = presenceResult.stateVersion!;
    }

    // Notify others of member joined
    socket.to(roomName).emit('MEMBER_JOINED', {
      member: memberData,
      timestamp
    });

    // Broadcast updated state to all (including the joiner via callback)
    io.to(roomName).emit('STATE_UPDATE', {
      state: currentState,
      stateVersion: currentVersion,
      triggeredBy: { actionType: 'MEMBER_JOINED', userId: decoded.userId }
    });

    callback({
      success: true,
      state: currentState,
      stateVersion: currentVersion,
      members: roomManager.getMembers(data.meetingCode)
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error joining meeting:', errorMessage, error);
    callback({ success: false, error: `Failed to join meeting: ${errorMessage}` });
  }
}
