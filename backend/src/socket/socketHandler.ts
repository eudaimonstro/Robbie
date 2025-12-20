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

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function setupSocketHandlers(io: TypedServer) {
  io.on('connection', (socket: TypedSocket) => {

    // Handle join meeting
    socket.on('JOIN_MEETING', async (data: JoinMeetingPayload, callback) => {
      try {
        const decoded = verifyToken(data.token);
        if (!decoded) {
          callback({ success: false, error: 'Invalid token' });
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

        // Notify others
        socket.to(roomName).emit('MEMBER_JOINED', {
          member: { id: decoded.userId, name: decoded.name, role, present: true },
          timestamp: new Date().toISOString()
        });

        callback({
          success: true,
          state: meeting.state,
          stateVersion: meeting.stateVersion,
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
      handleDisconnect(socket);
    });

    // Handle action dispatch
    socket.on('DISPATCH_ACTION', async (data: DispatchActionPayload, callback) => {
      try {
        if (!socket.data.meetingCode || !socket.data.userId) {
          callback({ success: false, error: 'Not in a meeting', errorCode: 'NOT_AUTHENTICATED' });
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

        // Enrich action with server-authoritative values
        let enrichedAction = enrichAction(data.action, socket.data);

        // Special enrichment for SET_MEMBER_ROLE - find current chair if assigning new chair
        if (data.action.type === 'SET_MEMBER_ROLE') {
          const roleAction = enrichedAction as { type: 'SET_MEMBER_ROLE'; targetMemberId: number; newRole: string; previousChairId?: number };
          if (roleAction.newRole === 'chair') {
            const storage = getStorage();
            const meeting = await storage.getMeeting(socket.data.meetingCode!);
            if (meeting) {
              const currentChair = meeting.state.members.find(m => m.role === 'chair');
              if (currentChair && currentChair.id !== roleAction.targetMemberId) {
                roleAction.previousChairId = currentChair.id;
              }
            }
          }
          enrichedAction = roleAction as MeetingAction;
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
      handleDisconnect(socket);
    });
  });
}

function handleDisconnect(socket: TypedSocket) {
  if (socket.data.meetingCode && socket.data.userId) {
    const roomName = `meeting:${socket.data.meetingCode}`;

    roomManager.removeMember(socket.data.meetingCode, socket.id);

    socket.to(roomName).emit('MEMBER_LEFT', {
      member: {
        id: socket.data.userId,
        name: socket.data.name,
        role: socket.data.role,
        present: false
      },
      timestamp: new Date().toISOString()
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
