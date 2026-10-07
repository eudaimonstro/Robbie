import type { Server, Socket } from 'socket.io';
import type { Member } from '@robbie-bylawyer/shared/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  JoinMeetingPayload,
  JoinMeetingResponse,
} from '@robbie-bylawyer/shared/types/socket';
import { roomManager } from './roomManager.js';
import { getStorage, type MeetingRecord } from '../db/meetingStorage.js';
import { joinRateLimiter } from './rateLimiter.js';
import { applyAction, type ApplyActionResult } from './stateManager.js';
import { markDisconnectedMembersAbsent } from './presenceReconciler.js';
import { handleDisconnect } from './disconnectHandler.js';
import { emitState, publicState } from './statePublisher.js';
import {
  countRosterVoters,
  findMeetingPacket,
  findPerson,
  stateFromPacket,
  type MeetingPacketInfo,
} from './meetingPacket.js';
import { deriveMeetingRole, roleChanges, updateSocketRoles } from './meetingRoles.js';
import { logger } from '../middleware/logger.js';
import { meetingCode as meetingCodeSchema } from '../schemas/common.js';

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

/** The answers when a join is refused */
export const NO_MEETING = 'No meeting with that code';
export const NAME_FIRST = 'Set your name first';
export const DISPLAY_FOR_MEMBERS = "Only the organization's members can open the display";

/** The live meeting for a packet, created from it when the first person arrives */
async function openMeeting(packet: MeetingPacketInfo): Promise<MeetingRecord> {
  const storage = getStorage();
  const existing = await storage.getMeeting(packet.robbieCode);
  if (existing) return existing;
  const rosterVoters = await countRosterVoters(packet.organizationId);
  return storage.getOrCreateMeeting(packet.robbieCode, stateFromPacket(packet, rosterVoters));
}

/**
 * Handle JOIN_MEETING socket event. A live meeting is a scheduled meeting: a code without a
 * packet is refused, and each person's role comes from the packet's organization.
 */
export async function handleJoinMeeting(
  socket: TypedSocket,
  io: TypedServer,
  data: JoinMeetingPayload,
  callback: (response: JoinMeetingResponse) => void,
): Promise<void> {
  try {
    // The socket was authenticated at connection (socketAuth)
    const userId = socket.data.userId;

    // Rate limit join attempts per user
    if (!joinRateLimiter.consume(userId)) {
      const retryAfter = joinRateLimiter.getRetryAfter(userId);
      callback({
        success: false,
        error: `Too many join attempts. Please wait ${Math.ceil(retryAfter / 1000)} seconds.`,
      });
      return;
    }

    const parsedCode = meetingCodeSchema.safeParse(data.meetingCode);
    if (!parsedCode.success) {
      callback({ success: false, error: parsedCode.error.issues[0].message });
      return;
    }
    const meetingCode = parsedCode.data;

    // A socket already in another meeting leaves it first, as on disconnect; otherwise it
    // kept receiving that meeting's updates and its member stayed present there
    if (socket.data.meetingCode && socket.data.meetingCode !== meetingCode) {
      await handleDisconnect(socket, io);
    }

    const packet = await findMeetingPacket(meetingCode);
    const person = packet ? await findPerson(packet.organizationId, userId) : null;
    if (!packet || !person) {
      callback({ success: false, error: NO_MEETING, errorCode: 'MEETING_NOT_FOUND' });
      return;
    }
    const roomName = `meeting:${meetingCode}`;

    // A display (a TV or projector) receives the meeting without becoming a member of it
    if (data.display === true) {
      if (!person.orgRole) {
        callback({ success: false, error: DISPLAY_FOR_MEMBERS, errorCode: 'PERMISSION_DENIED' });
        return;
      }
      const meeting = await openMeeting(packet);
      socket.data.meetingCode = meetingCode;
      socket.data.role = 'guest';
      socket.data.display = true;
      socket.join(roomName);
      callback({
        success: true,
        state: publicState(meeting.state),
        stateVersion: meeting.stateVersion,
        members: roomManager.getMembers(meetingCode),
      });
      return;
    }

    // Members are known by the name they signed in with
    const name = person.name?.trim();
    if (!name) {
      callback({ success: false, error: NAME_FIRST, errorCode: 'NAME_REQUIRED' });
      return;
    }
    const role = deriveMeetingRole(packet.chairUserId, person.orgRole, userId);
    const meeting = await openMeeting(packet);

    // Store socket data
    socket.data.name = name;
    socket.data.meetingCode = meetingCode;
    socket.data.role = role;
    socket.data.display = false;

    // Join the room
    socket.join(roomName);
    const memberData: Member = { id: userId, name, role, present: true, presentBy: 'device' };
    roomManager.addMember(meetingCode, socket.id, memberData);

    const timestamp = new Date().toISOString();
    let currentState = meeting.state;
    let currentVersion = meeting.stateVersion;
    const track = (result: ApplyActionResult) => {
      if (result.success) {
        currentState = result.state;
        currentVersion = result.stateVersion;
      }
    };

    // Add the member, or mark them present again
    const existing = currentState.members.find((m) => m.id === userId);
    track(
      await applyAction(
        meetingCode,
        existing
          ? { type: 'SET_MEMBER_PRESENCE', memberId: userId, present: true, timestamp }
          : { type: 'ADD_MEMBER', member: memberData, timestamp },
      ),
    );

    // Names and roles as the organization has them now: this member's, and those of others
    // that changed since they joined (a new presiding officer, a changed role, a restart)
    const others = await roleChanges(
      packet,
      currentState.members.filter((m) => m.id !== userId),
    );
    const self = currentState.members.find((m) => m.id === userId);
    const selfChanged = !!self && (self.name !== name || self.role !== role);
    const changes = selfChanged ? [{ id: userId, name, role }, ...others] : others;
    if (changes.length > 0) {
      track(
        await applyAction(meetingCode, { type: 'REFRESH_MEMBERS', members: changes, timestamp }),
      );
      await updateSocketRoles(io, meetingCode, others);
    }

    // Members still shown as present with no connection (left over from a server restart)
    // are marked absent, so quorum counts only who is here
    const reconciled = await markDisconnectedMembersAbsent(meetingCode, currentState);
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
    emitState(io, meetingCode, {
      state: currentState,
      stateVersion: currentVersion,
      triggeredBy: { actionType: 'MEMBER_JOINED', userId },
    });

    callback({
      success: true,
      state: publicState(currentState),
      stateVersion: currentVersion,
      members: roomManager.getMembers(meetingCode),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, 'Error joining meeting');
    callback({ success: false, error: `Failed to join meeting: ${errorMessage}` });
  }
}
