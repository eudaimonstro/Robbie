import type { Server, Socket } from 'socket.io';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { isQuorumSet } from '@robbie-bylawyer/shared/utils';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  JoinMeetingPayload,
  JoinMeetingResponse,
} from '@robbie-bylawyer/shared/types/socket';
import { roomManager } from './roomManager.js';
import { getStorage, type MeetingRecord } from '../db/meetingStorage.js';
import { joinFloodLimiter, joinRateLimiter } from './rateLimiter.js';
import { applyAction, getMeetingState, type ApplyActionResult } from './stateManager.js';
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
import { deriveMeetingRole, staleRoles, updateSocketRoles } from './meetingRoles.js';
import { previousMinutesFor } from '../bylawyer/services/meetingMinutes.js';
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
export const MEETING_ENDED = 'This meeting has adjourned';
export const QUORUM_NOT_SET =
  "The meeting can't open yet: the organization's voting members and quorum aren't set. An admin sets them in Settings.";
/** The answer when a join fails for a reason of the server's (the details go to the log) */
export const JOIN_FAILED = "Couldn't join the meeting. Try again.";
/** When a client tries again after a join failed for a reason of the server's */
export const JOIN_RETRY_MS = 3000;

/**
 * The live meeting for a packet, created from it when the first person arrives. A live state
 * saved before it recorded its organization, title and date gets them from the packet. A live
 * state of another organization (left by one that had this code and was deleted) is never
 * shown: it is deleted, and the meeting starts from the packet. Before the call to order, the
 * previous meeting's minutes are put before it. A meeting not yet open doesn't open (null)
 * until the organization has set its voting members and quorum: its quorum would be a guess.
 */
/** A live meeting as a join opened it: changed when opening it changed its state */
type OpenedMeeting = MeetingRecord & { changed?: boolean };

async function openMeeting(packet: MeetingPacketInfo): Promise<OpenedMeeting | null> {
  const storage = getStorage();
  let existing = await storage.getMeeting(packet.robbieCode);
  if (existing?.state.organizationId && existing.state.organizationId !== packet.organizationId) {
    logger.warn(
      { meetingCode: packet.robbieCode },
      'Deleted a live meeting of another organization that had this code',
    );
    await storage.deleteMeeting(packet.robbieCode);
    existing = null;
  }
  let meeting: OpenedMeeting;
  if (!existing) {
    if (!isQuorumSet(packet.organization)) return null;
    const rosterVoters = await countRosterVoters(packet.organizationId);
    meeting = await storage.getOrCreateMeeting(
      packet.robbieCode,
      stateFromPacket(packet, rosterVoters),
    );
  } else if (existing.state.organizationId) {
    meeting = existing;
  } else {
    const result = await applyAction(packet.robbieCode, {
      type: 'SET_MEETING_INFO',
      organizationId: packet.organizationId,
      title: packet.title ?? '',
      scheduledFor: packet.scheduledFor?.toISOString() ?? null,
      timestamp: new Date().toISOString(),
    });
    meeting = result.success
      ? { ...existing, state: result.state, stateVersion: result.stateVersion, changed: true }
      : existing;
  }
  return withPreviousMinutes(packet, meeting);
}

/**
 * A meeting not yet called to order, without previous minutes, gets the organization's most
 * recent published minutes (not yet approved, not its own) to approve. Best effort: a meeting
 * opens without them.
 */
async function withPreviousMinutes(
  packet: MeetingPacketInfo,
  meeting: OpenedMeeting,
): Promise<OpenedMeeting> {
  if (meeting.state.meetingStage !== 'not-started' || meeting.state.previousMinutesId) {
    return meeting;
  }
  try {
    const previous = await previousMinutesFor(packet.organizationId, packet.id);
    if (!previous) return meeting;
    const result = await applyAction(packet.robbieCode, {
      type: 'SET_PREVIOUS_MINUTES',
      minutes: previous.body,
      minutesId: previous.id,
    });
    return result.success
      ? { ...meeting, state: result.state, stateVersion: result.stateVersion, changed: true }
      : meeting;
  } catch (error) {
    logger.error(
      { err: error, meetingCode: packet.robbieCode },
      'Failed to put the previous minutes before the meeting',
    );
    return meeting;
  }
}

/** The meeting's state in memory now, or `known` if that is as new (or the meeting is gone) */
async function latestState(
  meetingCode: string,
  known: { state: MeetingState; stateVersion: number },
): Promise<{ state: MeetingState; stateVersion: number }> {
  const now = await getMeetingState(meetingCode);
  return now && now.stateVersion >= known.stateVersion ? now : known;
}

/** A join refused for too many attempts: when the client may try again */
function refuseForNow(
  callback: (response: JoinMeetingResponse) => void,
  retryAfterMs: number,
): void {
  callback({
    success: false,
    error: `Too many join attempts. Please wait ${Math.ceil(retryAfterMs / 1000)} seconds.`,
    errorCode: 'RATE_LIMITED',
    retryAfterMs,
  });
}

/**
 * Handle JOIN_MEETING socket event. A live meeting is a scheduled meeting: a code without a
 * packet is refused, and each person's role comes from the packet's organization.
 *
 * A phone joins again on every reconnect (the server keeps no connection state to recover), so a
 * join by a member already present changes nothing: no write, no broadcast, and the joiner gets
 * the state once, in the answer.
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

    // Joins that found no meeting are limited (against guessing codes), and every join has a
    // generous backstop; a join that finds the meeting spends nothing against guessing
    if (!joinRateLimiter.allows(userId)) {
      refuseForNow(callback, joinRateLimiter.getRetryAfter(userId));
      return;
    }
    if (!joinFloodLimiter.consume(userId)) {
      refuseForNow(callback, joinFloodLimiter.getRetryAfter(userId));
      return;
    }

    const parsedCode = meetingCodeSchema.safeParse(data.meetingCode);
    if (!parsedCode.success) {
      joinRateLimiter.consume(userId);
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
      joinRateLimiter.consume(userId);
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
      if (!meeting) {
        callback({ success: false, error: QUORUM_NOT_SET, errorCode: 'QUORUM_NOT_SET' });
        return;
      }
      socket.data.meetingCode = meetingCode;
      socket.data.role = 'guest';
      socket.data.display = true;
      socket.join(roomName);
      if (meeting.changed) {
        emitState(io, meetingCode, { state: meeting.state, stateVersion: meeting.stateVersion });
      }
      // The state as it is now, read after joining the room: anything later reaches the
      // socket as an update
      const latest = await latestState(meetingCode, meeting);
      callback({
        success: true,
        state: publicState(latest.state, 'guest'),
        stateVersion: latest.stateVersion,
        members: roomManager.getMembers(meetingCode),
      });
      return;
    }

    // Guests (anyone signed in who has the code) only until the meeting adjourns; its members
    // still come back to its record
    if (!person.orgRole && packet.endedAt) {
      callback({ success: false, error: MEETING_ENDED, errorCode: 'MEETING_NOT_ACTIVE' });
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
    if (!meeting) {
      callback({ success: false, error: QUORUM_NOT_SET, errorCode: 'QUORUM_NOT_SET' });
      return;
    }

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
    // Opening the meeting may have changed it (its organization, the previous minutes)
    let changed = !!meeting.changed;
    const track = (result: ApplyActionResult) => {
      if (result.success && result.changed) {
        currentState = result.state;
        currentVersion = result.stateVersion;
        changed = true;
      }
      return result.success && result.changed;
    };

    // Add the member, or mark them present again (nothing changes for one already present on a
    // device: a phone reconnecting)
    const existing = currentState.members.find((m) => m.id === userId);
    const arrived = track(
      await applyAction(
        meetingCode,
        existing
          ? { type: 'SET_MEMBER_PRESENCE', memberId: userId, present: true, timestamp }
          : { type: 'ADD_MEMBER', member: memberData, timestamp },
      ),
    );

    // This member's name and role as the organization has them now, and the roles of others
    // that changed since they joined (a new presiding officer, a changed role, a restart), all
    // checked at most once a minute; other members keep their names (one taken in the meeting
    // stays)
    const self = currentState.members.find((m) => m.id === userId);
    const selfChanged = !!self && (self.name !== name || self.role !== role);
    const stateChair = currentState.members.find((m) => m.role === 'chair')?.id ?? null;
    const others = await staleRoles(
      meetingCode,
      packet,
      currentState.members.filter((m) => m.id !== userId),
      // A chair shown who no longer presides
      selfChanged || (stateChair !== null && stateChair !== packet.chairUserId),
    );
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

    // The others hear of an arrival, not of a phone reconnecting
    if (arrived) {
      socket.to(roomName).emit('MEMBER_JOINED', {
        member: memberData,
        timestamp,
      });
    }

    // The room gets the new state (the joiner has it in the answer)
    if (changed) {
      emitState(io, meetingCode, {
        state: currentState,
        stateVersion: currentVersion,
        triggeredBy: { actionType: 'MEMBER_JOINED', userId },
      });
    }

    // The state as it is now (other actions may have been applied while this join waited), read
    // after joining the room: anything later reaches the socket as an update
    const latest = await latestState(meetingCode, {
      state: currentState,
      stateVersion: currentVersion,
    });
    callback({
      success: true,
      state: publicState(latest.state, socket.data.role),
      stateVersion: latest.stateVersion,
      members: roomManager.getMembers(meetingCode),
    });
  } catch (error) {
    // The error names files, hosts and queries: the log has it, the client a plain answer, and
    // when to try again
    logger.error({ err: error }, 'Error joining meeting');
    callback({ success: false, error: JOIN_FAILED, retryAfterMs: JOIN_RETRY_MS });
  }
}
