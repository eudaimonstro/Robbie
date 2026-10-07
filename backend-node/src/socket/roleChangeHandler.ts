import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  ActionErrorCode,
} from '@robbie-bylawyer/shared/types/socket';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { logger } from '../middleware/logger.js';
import { savePresidingOfficer } from './meetingPacket.js';
import { syncMeetingRoles, updateSocketRoles } from './meetingRoles.js';

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Validate SET_MEMBER_ROLE action before processing. Meeting roles come from the organization,
 * so the only role handed out in a meeting is the chair (by the chair or an admin).
 * Returns null if valid, error message if invalid
 */
export function validateRoleChange(
  action: MeetingAction,
  socketData: SocketData,
): { error: string; errorCode: ActionErrorCode } | null {
  if (action.type !== 'SET_MEMBER_ROLE') {
    return null;
  }

  if (action.newRole !== 'chair') {
    return {
      error: 'Meeting roles come from the organization; only the chair can be handed over here',
      errorCode: 'PERMISSION_DENIED',
    };
  }

  // Chair cannot assign chair to themselves
  if (socketData.role === 'chair' && action.targetMemberId === socketData.userId) {
    return {
      error: 'You are already the chair',
      errorCode: 'INVALID_ACTION',
    };
  }

  return null;
}

/**
 * After the chair is handed over: record the new presiding officer on the packet, so the chair
 * outlasts a restart, give the sockets their new roles, and bring the previous chair's role
 * back to what the organization gives them (admin for a secretary, say).
 * @returns the state after that, or null when the action wasn't a role change or nothing more
 *   changed
 */
export async function handleRoleChangePostAction(
  io: TypedServer,
  meetingCode: string,
  action: MeetingAction,
): Promise<{ state: MeetingState; stateVersion: number } | null> {
  if (action.type !== 'SET_MEMBER_ROLE') {
    return null;
  }

  try {
    await savePresidingOfficer(meetingCode, action.targetMemberId);
    await updateSocketRoles(io, meetingCode, [
      { id: action.targetMemberId, role: 'chair' },
      ...(action.previousChairId ? [{ id: action.previousChairId, role: 'member' as const }] : []),
    ]);
    return await syncMeetingRoles(io, meetingCode);
  } catch (error) {
    logger.error({ err: error, meetingCode }, 'Failed to record the new chair');
    return null;
  }
}
