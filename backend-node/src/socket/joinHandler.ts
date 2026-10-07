import type { Server, Socket } from 'socket.io';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
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
import { scheduleReconcile } from './presenceReconciler.js';
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
import { findSessionById } from '../auth/sessionService.js';
import { hasAcceptedTerms } from '../auth/terms.js';
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

/**
 * The live meeting for a packet, created from it when the first person arrives. A live state
 * saved before it recorded its organization, title and date gets them from the packet.
 */
async function openMeeting(packet: MeetingPacketInfo): Promise<MeetingRecord> {
  const storage = getStorage();
  const existing = await storage.getMeeting(packet.robbieCode);
  if (!existing) {
    const rosterVoters = await countRosterVoters(packet.organizationId);
    return storage.getOrCreateMeeting(packet.robbieCode, stateFromPacket(packet, rosterVoters));
  }
  if (existing.state.organizationId) return existing;
  const result = await applyAction(packet.robbieCode, {
    type: 'SET_MEETING_INFO',
    organizationId: packet.organizationId,
    title: packet.title ?? '',
    scheduledFor: packet.scheduledFor?.toISOString() ?? null,
    timestamp: new Date().toISOString(),
  });
  return result.success
    ? { ...existing, state: result.state, stateVersion: result.stateVersion }
    : existing;
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
      await handleDisconnect(socket, io, 'leave');
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
      // A member's socket that becomes a display is no longer the member's device: it leaves
      // the room as a dropped connection does, so the member's grace period starts if it was
      // their last one (otherwise it kept the member present for as long as the TV was on)
      if (socket.data.meetingCode === meetingCode && !socket.data.display) {
        await handleDisconnect(socket, io, 'disconnect');
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

    // This member's name and role as the organization has them now, and the roles of others
    // that changed since they joined (a new presiding officer, a changed role, a restart);
    // other members keep their names (one taken in the meeting stays)
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
    }
    // The joiner's other sockets (another tab) take the role too
    await updateSocketRoles(io, meetingCode, [{ id: userId, role }, ...others]);

    // Members still shown as present on a device with no connection (left over from a server
    // restart) are marked absent once the grace period has passed, so quorum counts only who
    // is here
    scheduleReconcile(io, meetingCode);

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

/**
 * A socket that connection state recovery brought back (after a moment without signal):
 * socket.io restores its rooms and socket.data, and the client doesn't join again, so the
 * connection middleware (socketAuth) and the join's checks don't run. The session may have
 * been signed out and the organization may have changed the person's role while the socket
 * was away: a socket without a live session is closed (a display too), and the role is derived
 * again as on a join. Then count it as connected again, which ends its grace period; if the
 * grace period ran out meanwhile, the member is present again.
 *
 * Until the checks pass the socket is in no meeting, so an action it sends meanwhile is refused
 * ("Not in a meeting"). A socket whose check fails is closed rather than left half recovered.
 */
export async function handleRecoveredSocket(socket: TypedSocket, io: TypedServer): Promise<void> {
  const meetingCode = socket.data.meetingCode;
  if (!meetingCode) return;
  socket.data.meetingCode = null;

  // The disconnect handler needs the meeting to clear the socket's place in it
  const close = () => {
    socket.data.meetingCode = meetingCode;
    socket.disconnect(true);
  };
  try {
    await recoverSocket(socket, io, meetingCode, close);
  } catch (error) {
    close();
    throw error;
  }
}

async function recoverSocket(
  socket: TypedSocket,
  io: TypedServer,
  meetingCode: string,
  close: () => void,
): Promise<void> {
  const { userId } = socket.data;

  const session = await findSessionById(socket.data.sessionId);
  if (!session || !hasAcceptedTerms(session.termsVersion)) {
    close();
    return;
  }
  // A display shows the meeting; it isn't a member of it
  if (socket.data.display) {
    socket.data.meetingCode = meetingCode;
    return;
  }
  const packet = await findMeetingPacket(meetingCode);
  const person = packet ? await findPerson(packet.organizationId, userId) : null;
  if (!packet || !person) {
    // The meeting is gone (as a join would find); the disconnect handler takes it from here
    close();
    return;
  }
  const role = deriveMeetingRole(packet.chairUserId, person.orgRole, userId);
  socket.data.role = role;
  socket.data.meetingCode = meetingCode;
  // Dropped again meanwhile, when the disconnect handler found it in no meeting: socket.io
  // saved this same data, so the next recovery brings it back to its meeting and checks again
  if (!socket.connected) return;
  roomManager.addMember(meetingCode, socket.id, {
    id: userId,
    name: socket.data.name,
    role,
    present: true,
  });

  const meeting = await getStorage().getMeeting(meetingCode);
  const member = meeting?.state.members.find((m) => m.id === userId);
  if (!member) return;
  const timestamp = new Date().toISOString();
  let latest: { state: MeetingState; stateVersion: number } | null = null;

  if (member.role !== role) {
    const refreshed = await applyAction(meetingCode, {
      type: 'REFRESH_MEMBERS',
      members: [{ id: userId, name: member.name, role }],
      timestamp,
    });
    if (refreshed.success) latest = refreshed;
    await updateSocketRoles(io, meetingCode, [{ id: userId, role }]);
  }
  if (!member.present) {
    const present = await applyAction(meetingCode, {
      type: 'SET_MEMBER_PRESENCE',
      memberId: userId,
      present: true,
      timestamp,
    });
    if (present.success) latest = present;
  }
  if (latest) {
    emitState(io, meetingCode, {
      state: latest.state,
      stateVersion: latest.stateVersion,
      triggeredBy: { actionType: 'MEMBER_JOINED', userId },
    });
  }
}
