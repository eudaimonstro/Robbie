import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  DispatchActionPayload,
  ActionResponse,
  ActionErrorCode,
} from '@robbie-bylawyer/shared/types/socket';
import type { MeetingAction } from '@robbie-bylawyer/shared/types';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import { checkPermission } from './permissionGuard.js';
import { isActionType, parseClientAction } from './actionSchemas.js';
import { getStorage } from '../db/meetingStorage.js';
import { actionRateLimiter } from './rateLimiter.js';
import { validateAction } from './actionValidator.js';
import { enrichAction } from './actionEnricher.js';
import { validateRoleChange, handleRoleChangePostAction } from './roleChangeHandler.js';
import { applyAction, DEFERRED_WRITES } from './stateManager.js';
import { recordMeetingTimes } from './meetingPacket.js';
import { afterAttendanceAction, prepareAttendanceAction } from './attendanceActions.js';
import { prepareBylawMotion } from './bylawMotion.js';
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

/** Refuse an action: the callback, and ACTION_REJECTED for the client's pending action */
function reject(
  socket: TypedSocket,
  clientSequence: number,
  callback: (response: ActionResponse) => void,
  reason: string,
  errorCode: ActionErrorCode,
): void {
  callback({ success: false, error: reason, errorCode });
  socket.emit('ACTION_REJECTED', { clientSequence, reason, errorCode });
}

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

    // The action's type must be one of the meeting's actions (an own key, never a prototype
    // key), and the sender's role allowed to send it
    const actionType: unknown = (data.action as { type?: unknown }).type;
    if (!isActionType(actionType)) {
      reject(socket, data.clientSequence, callback, 'Unknown action type', 'INVALID_ACTION');
      return;
    }
    if (!checkPermission(socket.data.role, actionType)) {
      reject(
        socket,
        data.clientSequence,
        callback,
        `Permission denied: ${socket.data.role} cannot perform ${actionType}`,
        'PERMISSION_DENIED',
      );
      return;
    }

    // Its shape: every field of the right type and within its bounds, and nothing else. From
    // here on only the parsed action is read.
    const parsed = parseClientAction(data.action);
    if (!parsed.success) {
      reject(socket, data.clientSequence, callback, parsed.error, 'VALIDATION_FAILED');
      return;
    }
    const action = parsed.action;

    // Validate role change restrictions
    const roleChangeError = validateRoleChange(action, socket.data);
    if (roleChangeError) {
      callback({
        success: false,
        error: roleChangeError.error,
        errorCode: roleChangeError.errorCode,
      });
      return;
    }

    // The meeting's state (in memory) once, for validation and enrichment
    const meeting = await getStorage().peekMeeting(meetingCode);
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
    if (action.type === 'OPEN_VOTING') {
      const attendance = attendanceSummary(meeting.state);
      if (!attendance.hasQuorum) {
        votingWithoutQuorum = true;
        logger.warn(
          { meetingCode, present: attendance.present, quorumRequired: attendance.quorum },
          'Vote opened without quorum',
        );
      }
    }

    // Enrich action with server-authoritative values
    let enrichedAction = enrichAction(action, socket.data, meeting.state.members);

    // Special enrichment for OPEN_VOTING - add quorum warning flag
    if (action.type === 'OPEN_VOTING' && votingWithoutQuorum) {
      enrichedAction = { ...enrichedAction, withoutQuorum: true } as MeetingAction;
    }

    // Special enrichment for SET_MEMBER_ROLE: find the current chair (the enricher records who
    // made the change)
    if (action.type === 'SET_MEMBER_ROLE') {
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

    // A bylaw amendment carries the text the room votes on, from the bylaws themselves
    const bylawMotion = await prepareBylawMotion(meetingCode, meeting.state, enrichedAction);
    if ('error' in bylawMotion) {
      reject(socket, data.clientSequence, callback, bylawMotion.error, bylawMotion.errorCode);
      return;
    }
    enrichedAction = bylawMotion.action;

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
    // held up by database work). Clients ignore a state older than the one they have; an action
    // that changed nothing sends nothing.
    if (result.changed || afterRoleChange) {
      emitState(
        io,
        meetingCode,
        {
          state: latest.state,
          stateVersion: latest.stateVersion,
          triggeredBy: {
            actionType: action.type,
            userId,
          },
        },
        // Votes and hands come by the hundred and wait for the window; anything else (the
        // chair's actions, a motion, a decision) goes out at once
        { immediate: !DEFERRED_WRITES.has(action.type) },
      );
    }

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

    // Post-action: Sync bylaw amendments to Bylawyer once decided, on a vote or by unanimous
    // consent
    if (
      enrichedAction.type === 'CLOSE_VOTING' ||
      enrichedAction.type === 'UNANIMOUS_CONSENT_PASSED'
    ) {
      try {
        // The states either side of the action as it was applied in the meeting's queue, not
        // the state read before it waited there
        const syncResult = await checkAndSyncBylawAmendment(
          meetingCode,
          enrichedAction,
          result.previousState,
          result.state,
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
