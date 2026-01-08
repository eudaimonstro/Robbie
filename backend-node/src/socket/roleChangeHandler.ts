import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  ActionErrorCode
} from '@robbie-bylawyer/shared/types/socket';
import type { MeetingAction } from '@robbie-bylawyer/shared/types';
import { getStorage } from '../db/meetingStorage.js';
import { roomManager } from './roomManager.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

interface SetMemberRoleAction {
  type: 'SET_MEMBER_ROLE';
  targetMemberId: number;
  newRole: 'member' | 'chair' | 'admin';
  previousChairId?: number;
  changedBy?: string;
  changedById?: number;
}

/**
 * Validate SET_MEMBER_ROLE action before processing
 * Returns null if valid, error message if invalid
 */
export function validateRoleChange(
  action: MeetingAction,
  socketData: SocketData
): { error: string; errorCode: ActionErrorCode } | null {
  if (action.type !== 'SET_MEMBER_ROLE') {
    return null;
  }

  const roleAction = action as SetMemberRoleAction;

  // Chair can only transfer chair role (not assign admin or demote others)
  if (socketData.role === 'chair') {
    if (roleAction.newRole !== 'chair') {
      return {
        error: 'Chair can only transfer the chair role, not assign other roles',
        errorCode: 'PERMISSION_DENIED'
      };
    }
    // Chair cannot assign chair to themselves
    if (roleAction.targetMemberId === socketData.userId) {
      return {
        error: 'You are already the chair',
        errorCode: 'INVALID_ACTION'
      };
    }
  }

  // Only admins can assign admin role
  if (socketData.role !== 'admin' && roleAction.newRole === 'admin') {
    return {
      error: 'Only admins can assign the admin role',
      errorCode: 'PERMISSION_DENIED'
    };
  }

  return null;
}

/**
 * Handle post-action updates for role changes
 * Updates storage, roomManager, and socket data for affected members
 */
export async function handleRoleChangePostAction(
  io: TypedServer,
  meetingCode: string,
  action: MeetingAction
): Promise<void> {
  if (action.type !== 'SET_MEMBER_ROLE') {
    return;
  }

  const roleAction = action as SetMemberRoleAction;
  const storage = getStorage();

  // Update target member's role in storage
  await storage.setParticipantRole(
    meetingCode,
    String(roleAction.targetMemberId),
    roleAction.newRole
  );

  // If there was a previous chair being demoted, update their role too
  if (roleAction.previousChairId) {
    await storage.setParticipantRole(
      meetingCode,
      String(roleAction.previousChairId),
      'member'
    );
  }

  // Update roomManager for connected members
  roomManager.updateMemberRole(meetingCode, roleAction.targetMemberId, roleAction.newRole);
  if (roleAction.previousChairId) {
    roomManager.updateMemberRole(meetingCode, roleAction.previousChairId, 'member');
  }

  // Update socket.data.role for affected sockets
  const roomName = `meeting:${meetingCode}`;
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
