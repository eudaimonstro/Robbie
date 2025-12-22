import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  JoinMeetingPayload,
  DispatchActionPayload
} from '@robbie/shared/types/socket';
import type { MeetingState, MeetingAction } from '@robbie/shared/types';
import { meetingReducer } from '@robbie/shared/reducer';
import { verifyToken } from '../auth/authController.js';
import { checkPermission } from './permissionGuard.js';
import { roomManager } from './roomManager.js';
import { getStorage } from '../db/meetingStorage.js';
import { actionRateLimiter, joinRateLimiter } from './rateLimiter.js';
import { validateAction } from './actionValidator.js';

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

export function setupSocketHandlers(io: TypedServer) {
  io.on('connection', (socket: TypedSocket) => {

    // Handle join meeting
    socket.on('JOIN_MEETING', async (data: JoinMeetingPayload, callback) => {
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
    });

    // Handle leave meeting
    socket.on('LEAVE_MEETING', () => {
      handleDisconnect(socket, io);
    });

    // Handle action dispatch
    socket.on('DISPATCH_ACTION', async (data: DispatchActionPayload, callback) => {
      try {
        if (!socket.data.meetingCode || !socket.data.userId) {
          callback({ success: false, error: 'Not in a meeting', errorCode: 'NOT_AUTHENTICATED' });
          return;
        }

        // Rate limit actions per user
        if (!actionRateLimiter.consume(socket.data.userId)) {
          const retryAfter = actionRateLimiter.getRetryAfter(socket.data.userId);
          callback({
            success: false,
            error: `Too many actions. Please wait ${Math.ceil(retryAfter / 1000)} seconds.`,
            errorCode: 'RATE_LIMITED'
          });
          return;
        }

        // Special handling for SET_MEMBER_ROLE - additional restrictions beyond permission matrix
        if (data.action.type === 'SET_MEMBER_ROLE') {
          const roleAction = data.action as { type: 'SET_MEMBER_ROLE'; targetMemberId: number; newRole: string };

          // Chair can only transfer chair role (not assign admin or demote others)
          if (socket.data.role === 'chair') {
            if (roleAction.newRole !== 'chair') {
              callback({
                success: false,
                error: 'Chair can only transfer the chair role, not assign other roles',
                errorCode: 'PERMISSION_DENIED'
              });
              return;
            }
            // Chair cannot assign chair to themselves
            if (roleAction.targetMemberId === socket.data.userId) {
              callback({
                success: false,
                error: 'You are already the chair',
                errorCode: 'INVALID_ACTION'
              });
              return;
            }
          }

          // Only admins can assign admin role
          if (socket.data.role !== 'admin' && roleAction.newRole === 'admin') {
            callback({
              success: false,
              error: 'Only admins can assign the admin role',
              errorCode: 'PERMISSION_DENIED'
            });
            return;
          }
        }

        // Check permission
        const permitted = checkPermission(socket.data.role, data.action.type);
        if (!permitted) {
          callback({
            success: false,
            error: `Permission denied: ${socket.data.role} cannot perform ${data.action.type}`,
            errorCode: 'PERMISSION_DENIED'
          });
          socket.emit('ACTION_REJECTED', {
            clientSequence: data.clientSequence,
            reason: `Permission denied for action ${data.action.type}`,
            errorCode: 'PERMISSION_DENIED'
          });
          return;
        }

        // Fetch meeting state once for validation and enrichment
        const storage = getStorage();
        const meeting = await storage.getMeeting(socket.data.meetingCode!);
        if (!meeting) {
          callback({
            success: false,
            error: 'Meeting not found',
            errorCode: 'MEETING_NOT_FOUND'
          });
          return;
        }

        // Quorum warning for voting actions (allow but log warning)
        let votingWithoutQuorum = false;
        if (data.action.type === 'OPEN_VOTING') {
          const presentCount = meeting.state.members.filter(m => m.present).length;
          if (presentCount < meeting.state.quorum) {
            votingWithoutQuorum = true;
            console.warn(`[QUORUM WARNING] Vote opened without quorum in meeting ${socket.data.meetingCode}: ${presentCount} of ${meeting.state.quorum} required`);
          }
        }

        // Voter membership validation
        if (data.action.type === 'CAST_VOTE') {
          const voter = meeting.state.members.find(m => m.id === socket.data.userId);
          if (!voter) {
            callback({
              success: false,
              error: 'You are not a member of this meeting',
              errorCode: 'NOT_A_MEMBER'
            });
            return;
          }
          if (!voter.present) {
            callback({
              success: false,
              error: 'You must be present to vote',
              errorCode: 'NOT_PRESENT'
            });
            return;
          }
          if (!meeting.state.votingOpen) {
            callback({
              success: false,
              error: 'Voting is not open',
              errorCode: 'VOTING_CLOSED'
            });
            return;
          }
        }

        // Enrich action with server-authoritative values
        let enrichedAction = enrichAction(data.action, socket.data);

        // Special enrichment for OPEN_VOTING - add quorum warning flag
        if (data.action.type === 'OPEN_VOTING' && votingWithoutQuorum) {
          enrichedAction = { ...enrichedAction, withoutQuorum: true } as MeetingAction;
        }

        // Special enrichment for SET_MEMBER_ROLE - add audit info and find current chair if needed
        if (data.action.type === 'SET_MEMBER_ROLE') {
          const roleAction = enrichedAction as {
            type: 'SET_MEMBER_ROLE';
            targetMemberId: number;
            newRole: string;
            previousChairId?: number;
            changedBy: string;
            changedById: number;
          };

          // Add audit fields
          roleAction.changedBy = socket.data.name;
          roleAction.changedById = socket.data.userId;

          // Find current chair if assigning new chair
          if (roleAction.newRole === 'chair') {
            const currentChair = meeting.state.members.find(m => m.role === 'chair');
            if (currentChair && currentChair.id !== roleAction.targetMemberId) {
              roleAction.previousChairId = currentChair.id;
            }
          }
          enrichedAction = roleAction as MeetingAction;
        }

        // Pre-validate action before applying
        const validation = validateAction(meeting.state, enrichedAction);
        if (!validation.valid) {
          callback({
            success: false,
            error: validation.error,
            errorCode: validation.errorCode
          });
          socket.emit('ACTION_REJECTED', {
            clientSequence: data.clientSequence,
            reason: validation.error || 'Action validation failed',
            errorCode: validation.errorCode || 'VALIDATION_FAILED'
          });
          return;
        }

        // Apply action
        const result = await applyAction(socket.data.meetingCode, enrichedAction);
        if (!result.success) {
          callback({
            success: false,
            error: result.error,
            errorCode: 'INVALID_STATE'
          });
          return;
        }

        // Post-action: Update storage and sockets for role changes
        if (data.action.type === 'SET_MEMBER_ROLE') {
          const roleAction = enrichedAction as { type: 'SET_MEMBER_ROLE'; targetMemberId: number; newRole: 'member' | 'chair' | 'admin'; previousChairId?: number };
          const storage = getStorage();

          // Update target member's role in storage
          await storage.setParticipantRole(
            socket.data.meetingCode!,
            String(roleAction.targetMemberId),
            roleAction.newRole
          );

          // If there was a previous chair being demoted, update their role too
          if (roleAction.previousChairId) {
            await storage.setParticipantRole(
              socket.data.meetingCode!,
              String(roleAction.previousChairId),
              'member'
            );
          }

          // Update roomManager for connected members
          roomManager.updateMemberRole(socket.data.meetingCode!, roleAction.targetMemberId, roleAction.newRole);
          if (roleAction.previousChairId) {
            roomManager.updateMemberRole(socket.data.meetingCode!, roleAction.previousChairId, 'member');
          }

          // Update socket.data.role for affected sockets
          const roomName = `meeting:${socket.data.meetingCode}`;
          const socketsInRoom = await io.in(roomName).fetchSockets();
          for (const s of socketsInRoom) {
            if (s.data.userId === roleAction.targetMemberId) {
              s.data.role = roleAction.newRole;
            }
            if (roleAction.previousChairId && s.data.userId === roleAction.previousChairId) {
              s.data.role = 'member';
            }
          }

        }

        // Broadcast new state to all clients in the room
        const roomName = `meeting:${socket.data.meetingCode}`;
        io.to(roomName).emit('STATE_UPDATE', {
          state: result.state!,
          stateVersion: result.stateVersion!,
          triggeredBy: {
            actionType: data.action.type,
            userId: socket.data.userId
          }
        });

        callback({ success: true, stateVersion: result.stateVersion });

      } catch (error) {
        console.error('Error dispatching action:', error);
        callback({ success: false, error: 'Failed to process action', errorCode: 'INVALID_ACTION' });
      }
    });

    // Handle state request
    socket.on('REQUEST_STATE', async (callback) => {
      try {
        if (!socket.data.meetingCode) {
          callback({ success: false, error: 'Not in a meeting' });
          return;
        }

        const storage = getStorage();
        const meeting = await storage.getMeeting(socket.data.meetingCode);
        if (!meeting) {
          callback({ success: false, error: 'Meeting not found' });
          return;
        }

        callback({
          success: true,
          state: meeting.state,
          stateVersion: meeting.stateVersion
        });

      } catch (error) {
        console.error('Error fetching state:', error);
        callback({ success: false, error: 'Failed to fetch state' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      handleDisconnect(socket, io);
    });
  });
}

async function handleDisconnect(socket: TypedSocket, io: TypedServer) {
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

/**
 * Enrich action with server-authoritative values
 * This prevents clients from spoofing their identity
 */
function enrichAction(action: MeetingAction, socketData: SocketData): MeetingAction {
  const enriched = { ...action } as MeetingAction & Record<string, unknown>;

  // Override any user-related IDs with authenticated values
  if ('voterId' in enriched) {
    enriched.voterId = socketData.userId;
  }
  if ('moverId' in enriched) {
    enriched.moverId = socketData.userId;
  }
  if ('askerId' in enriched) {
    enriched.askerId = socketData.userId;
  }
  if ('nominatorId' in enriched) {
    enriched.nominatorId = socketData.userId;
  }

  // Override names with authenticated values
  if ('mover' in enriched) {
    enriched.mover = socketData.name;
  }
  if ('seconder' in enriched) {
    enriched.seconder = socketData.name;
  }
  if ('objector' in enriched) {
    enriched.objector = socketData.name;
  }
  if ('askedBy' in enriched) {
    enriched.askedBy = socketData.name;
  }
  if ('nominatedBy' in enriched) {
    enriched.nominatedBy = socketData.name;
  }
  if ('answeredBy' in enriched) {
    enriched.answeredBy = socketData.name;
  }

  // Server generates timestamps
  if ('timestamp' in enriched) {
    enriched.timestamp = new Date().toLocaleTimeString();
  }

  // Server generates IDs
  if ('motionId' in enriched) {
    enriched.motionId = Date.now();
  }
  if ('nominationId' in enriched) {
    enriched.nominationId = Date.now();
  }
  if ('inquiryId' in enriched) {
    enriched.inquiryId = Date.now();
  }
  if ('electionId' in enriched) {
    enriched.electionId = Date.now();
  }
  if ('itemId' in enriched) {
    enriched.itemId = Date.now();
  }

  return enriched as MeetingAction;
}

async function applyAction(
  meetingCode: string,
  action: MeetingAction
): Promise<{ success: boolean; state?: MeetingState; stateVersion?: number; error?: string }> {
  const storage = getStorage();
  const meeting = await storage.getMeeting(meetingCode);
  if (!meeting) {
    return { success: false, error: 'Meeting not found' };
  }

  try {
    // Apply the reducer
    const newState = meetingReducer(meeting.state, action);
    const newVersion = meeting.stateVersion + 1;

    // Persist the new state
    await storage.updateMeetingState(meetingCode, newState, newVersion);

    return { success: true, state: newState, stateVersion: newVersion };
  } catch (error) {
    console.error('Error applying action:', error);
    return { success: false, error: 'Failed to apply action' };
  }
}
