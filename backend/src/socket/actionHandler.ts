import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  DispatchActionPayload,
  ActionResponse
} from '@robbie/shared/types/socket';
import type { MeetingAction } from '@robbie/shared/types';
import { checkPermission } from './permissionGuard.js';
import { getStorage } from '../db/meetingStorage.js';
import { actionRateLimiter } from './rateLimiter.js';
import { validateAction } from './actionValidator.js';
import { enrichAction } from './actionEnricher.js';
import { validateRoleChange, handleRoleChangePostAction } from './roleChangeHandler.js';
import { applyAction } from './stateManager.js';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Handle DISPATCH_ACTION socket event
 */
export async function handleDispatchAction(
  socket: TypedSocket,
  io: TypedServer,
  data: DispatchActionPayload,
  callback: (response: ActionResponse) => void
): Promise<void> {
  try {
    if (!socket.data.meetingCode || !socket.data.userId) {
      callback({ success: false, error: 'Not in a meeting', errorCode: 'NOT_AUTHENTICATED' });
      return;
    }

    // Store validated values to avoid non-null assertions later
    const meetingCode = socket.data.meetingCode;
    const userId = socket.data.userId;

    // Rate limit actions per user
    if (!actionRateLimiter.consume(userId)) {
      const retryAfter = actionRateLimiter.getRetryAfter(userId);
      callback({
        success: false,
        error: `Too many actions. Please wait ${Math.ceil(retryAfter / 1000)} seconds.`,
        errorCode: 'RATE_LIMITED'
      });
      return;
    }

    // Validate role change restrictions
    const roleChangeError = validateRoleChange(data.action, socket.data);
    if (roleChangeError) {
      callback({
        success: false,
        error: roleChangeError.error,
        errorCode: roleChangeError.errorCode
      });
      return;
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
    const meeting = await storage.getMeeting(meetingCode);
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
      const presentCount = meeting.state.members.reduce((count, m) => count + (m.present ? 1 : 0), 0);
      if (presentCount < meeting.state.quorum) {
        votingWithoutQuorum = true;
        console.warn(`[QUORUM WARNING] Vote opened without quorum in meeting ${meetingCode}: ${presentCount} of ${meeting.state.quorum} required`);
      }
    }

    // Voter membership validation
    if (data.action.type === 'CAST_VOTE') {
      const voter = meeting.state.members.find(m => m.id === userId);
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

    // Apply action with optimistic locking
    const result = await applyAction(meetingCode, enrichedAction);
    if (!result.success) {
      callback({
        success: false,
        error: result.error,
        errorCode: result.errorCode || 'INVALID_STATE'
      });
      return;
    }

    // Post-action: Update storage and sockets for role changes
    await handleRoleChangePostAction(io, meetingCode, enrichedAction);

    // Broadcast new state to all clients in the room
    const roomName = `meeting:${meetingCode}`;
    io.to(roomName).emit('STATE_UPDATE', {
      state: result.state,
      stateVersion: result.stateVersion,
      triggeredBy: {
        actionType: data.action.type,
        userId
      }
    });

    callback({ success: true, stateVersion: result.stateVersion });

  } catch (error) {
    console.error('Error dispatching action:', error);
    callback({ success: false, error: 'Failed to process action', errorCode: 'INVALID_ACTION' });
  }
}
