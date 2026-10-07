import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  DispatchActionPayload,
  ActionResponse,
} from '@robbie-bylawyer/shared/types/socket';
import type { MeetingAction } from '@robbie-bylawyer/shared/types';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import { checkPermission } from './permissionGuard.js';
import { getStorage } from '../db/meetingStorage.js';
import { actionRateLimiter } from './rateLimiter.js';
import { validateAction } from './actionValidator.js';
import { enrichAction } from './actionEnricher.js';
import { validateRoleChange, handleRoleChangePostAction } from './roleChangeHandler.js';
import { applyAction } from './stateManager.js';
import { recordMeetingTimes } from './meetingPacket.js';
import { afterAttendanceAction, prepareAttendanceAction } from './attendanceActions.js';
import { emitState } from './statePublisher.js';
import { checkAndSyncBylawAmendment } from '../bylawyer/bylawSyncService.js';
import {
  draftMinutesOnAdjournment,
  markPreviousMinutesApproved,
} from '../bylawyer/services/meetingMinutes.js';
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
 * Handle DISPATCH_ACTION socket event
 */
export async function handleDispatchAction(
  socket: TypedSocket,
  io: TypedServer,
  data: DispatchActionPayload,
  callback: (response: ActionResponse) => void,
): Promise<void> {
  try {
    if (!socket.data.meetingCode || !socket.data.userId) {
      callback({ success: false, error: 'Not in a meeting', errorCode: 'NOT_AUTHENTICATED' });
      return;
    }

    // Store validated values to avoid non-null assertions later
    const meetingCode = socket.data.meetingCode;
    const userId = socket.data.userId;

    // A display shows the meeting; it doesn't take part
    if (socket.data.display) {
      callback({
        success: false,
        error: 'A display cannot take part in the meeting',
        errorCode: 'PERMISSION_DENIED',
      });
      return;
    }

    // Rate limit actions per user
    if (!actionRateLimiter.consume(userId)) {
      const retryAfter = actionRateLimiter.getRetryAfter(userId);
      callback({
        success: false,
        error: `Too many actions. Please wait ${Math.ceil(retryAfter / 1000)} seconds.`,
        errorCode: 'RATE_LIMITED',
      });
      return;
    }

    // Validate role change restrictions
    const roleChangeError = validateRoleChange(data.action, socket.data);
    if (roleChangeError) {
      callback({
        success: false,
        error: roleChangeError.error,
        errorCode: roleChangeError.errorCode,
      });
      return;
    }

    // Check permission
    const permitted = checkPermission(socket.data.role, data.action.type);
    if (!permitted) {
      callback({
        success: false,
        error: `Permission denied: ${socket.data.role} cannot perform ${data.action.type}`,
        errorCode: 'PERMISSION_DENIED',
      });
      socket.emit('ACTION_REJECTED', {
        clientSequence: data.clientSequence,
        reason: `Permission denied for action ${data.action.type}`,
        errorCode: 'PERMISSION_DENIED',
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
        errorCode: 'MEETING_NOT_FOUND',
      });
      return;
    }

    // Quorum warning for voting actions (allow but log warning). Attendance counts members on
    // a device or marked present, the headcount, and proxies when they count; never guests.
    let votingWithoutQuorum = false;
    if (data.action.type === 'OPEN_VOTING') {
      const attendance = attendanceSummary(meeting.state);
      if (!attendance.hasQuorum) {
        votingWithoutQuorum = true;
        logger.warn(
          { meetingCode, present: attendance.present, quorumRequired: attendance.quorum },
          'Vote opened without quorum',
        );
      }
    }

    // Voter membership validation
    if (data.action.type === 'CAST_VOTE') {
      const voter = meeting.state.members.find((m) => m.id === userId);
      if (!voter) {
        callback({
          success: false,
          error: 'You are not a member of this meeting',
          errorCode: 'NOT_A_MEMBER',
        });
        return;
      }
      if (!voter.present) {
        callback({
          success: false,
          error: 'You must be present to vote',
          errorCode: 'NOT_PRESENT',
        });
        return;
      }
      if (!meeting.state.votingOpen) {
        callback({
          success: false,
          error: 'Voting is not open',
          errorCode: 'VOTING_CLOSED',
        });
        return;
      }
    }

    // Rename authorization: members can only rename themselves, admins/chairs can rename anyone
    // Members can only self-rename once
    if (data.action.type === 'RENAME_MEMBER') {
      const renameAction = data.action as { memberId: number };
      const isRenamingSelf = renameAction.memberId === userId;
      const isAdminOrChair = socket.data.role === 'admin' || socket.data.role === 'chair';

      if (!isRenamingSelf && !isAdminOrChair) {
        callback({
          success: false,
          error: 'You can only rename yourself',
          errorCode: 'PERMISSION_DENIED',
        });
        return;
      }

      // Members can only rename themselves once (admins/chairs can rename anyone anytime)
      if (isRenamingSelf && !isAdminOrChair) {
        const member = meeting.state.members.find((m) => m.id === userId);
        if (member?.selfRenameUsed) {
          callback({
            success: false,
            error:
              'You have already changed your name once. Ask the chair or admin if you need another change.',
            errorCode: 'RENAME_LIMIT_REACHED',
          });
          return;
        }
      }
    }

    // Enrich action with server-authoritative values
    let enrichedAction = enrichAction(data.action, socket.data, meeting.state.members);

    // Special enrichment for OPEN_VOTING - add quorum warning flag
    if (data.action.type === 'OPEN_VOTING' && votingWithoutQuorum) {
      enrichedAction = { ...enrichedAction, withoutQuorum: true } as MeetingAction;
    }

    // Special enrichment for SET_MEMBER_ROLE: find the current chair (the enricher records who
    // made the change)
    if (data.action.type === 'SET_MEMBER_ROLE') {
      const roleAction = enrichedAction as {
        type: 'SET_MEMBER_ROLE';
        targetMemberId: number;
        newRole: string;
        previousChairId?: number;
      };

      // Find current chair if assigning new chair
      if (roleAction.newRole === 'chair') {
        const currentChair = meeting.state.members.find((m) => m.role === 'chair');
        if (currentChair && currentChair.id !== roleAction.targetMemberId) {
          roleAction.previousChairId = currentChair.id;
        }
      }
      enrichedAction = roleAction as MeetingAction;
    }

    // Attendance: the roster entry for MARK_PRESENT, and MARK_ABSENT only once a device is gone
    const prepared = await prepareAttendanceAction(meetingCode, meeting.state, enrichedAction);
    if ('error' in prepared) {
      callback({ success: false, error: prepared.error, errorCode: prepared.errorCode });
      socket.emit('ACTION_REJECTED', {
        clientSequence: data.clientSequence,
        reason: prepared.error,
        errorCode: prepared.errorCode,
      });
      return;
    }
    enrichedAction = prepared.action;

    // Pre-validate action before applying
    const validation = validateAction(meeting.state, enrichedAction);
    if (!validation.valid) {
      callback({
        success: false,
        error: validation.error,
        errorCode: validation.errorCode,
      });
      socket.emit('ACTION_REJECTED', {
        clientSequence: data.clientSequence,
        reason: validation.error || 'Action validation failed',
        errorCode: validation.errorCode || 'VALIDATION_FAILED',
      });
      return;
    }

    // Apply action with optimistic locking
    // Pass validateAction to re-run on each retry attempt, catching race conditions
    // (e.g., proxy revoked between initial validation and execution)
    const result = await applyAction(meetingCode, enrichedAction, validateAction);
    if (!result.success) {
      callback({
        success: false,
        error: result.error,
        errorCode: result.errorCode || 'INVALID_STATE',
      });
      // Emit ACTION_REJECTED for validation failures on retry (e.g., proxy revoked)
      if (
        result.errorCode &&
        result.errorCode !== 'CONCURRENCY_CONFLICT' &&
        result.errorCode !== 'MEETING_NOT_FOUND'
      ) {
        socket.emit('ACTION_REJECTED', {
          clientSequence: data.clientSequence,
          reason: result.error || 'Action validation failed',
          errorCode: result.errorCode,
        });
      }
      return;
    }

    // Post-action: a member marked absent has no grace period to wait for
    afterAttendanceAction(meetingCode, enrichedAction);

    // Post-action: a new chair is recorded on the packet, and sockets and roles follow
    const afterRoleChange = await handleRoleChangePostAction(io, meetingCode, enrichedAction);
    const latest = afterRoleChange ?? { state: result.state, stateVersion: result.stateVersion };

    // Broadcast new state to all clients in the room, after the role change (so a new chair's
    // socket already has its permissions) and before the bylaw sync (so the vote result isn't
    // held up by database work). Clients ignore a state older than the one they have.
    emitState(io, meetingCode, {
      state: latest.state,
      stateVersion: latest.stateVersion,
      triggeredBy: {
        actionType: data.action.type,
        userId,
      },
    });

    callback({ success: true, stateVersion: latest.stateVersion });

    // Post-action: the schedule records when the meeting was called to order and adjourned
    await recordMeetingTimes(meetingCode, enrichedAction);

    // Post-action: the minutes. Adjourning drafts them (after the times they give are
    // recorded); approving the previous minutes marks them approved. Both best effort.
    if (enrichedAction.type === 'END_MEETING') {
      await draftMinutesOnAdjournment(meetingCode, latest.state);
    } else if (enrichedAction.type === 'APPROVE_MINUTES') {
      await markPreviousMinutesApproved(meetingCode, latest.state);
    }

    // Post-action: Sync bylaw amendments to Bylawyer after vote closes
    if (enrichedAction.type === 'CLOSE_VOTING') {
      try {
        const syncResult = await checkAndSyncBylawAmendment(
          meetingCode,
          enrichedAction,
          meeting.state, // Previous state (before action was applied)
          result.state, // New state (after action was applied)
        );
        if (syncResult) {
          logger.info({ syncResult }, 'Bylaw sync result');
        }
      } catch (syncError) {
        // Log but don't fail the action - sync is best-effort
        logger.error({ err: syncError }, 'Bylaw sync error');
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error dispatching action');
    callback({ success: false, error: 'Failed to process action', errorCode: 'INVALID_ACTION' });
  }
}
