import type { Server } from 'socket.io';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import { getStorage } from '../db/meetingStorage.js';
import { PRESENCE_GRACE_MS, roomManager } from './roomManager.js';
import { applyAction } from './stateManager.js';
import { emitState } from './statePublisher.js';
import { runEvent } from './socketEvents.js';

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** Whether a member is present only because of a device that is gone, with no grace left */
function isStale(meetingCode: string, member: MeetingState['members'][number]): boolean {
  return (
    member.present &&
    member.presentBy !== 'chair' &&
    !roomManager.isMemberConnected(meetingCode, member.id) &&
    !roomManager.inGrace(meetingCode, member.id)
  );
}

/**
 * Mark absent every member the state shows as present on a device that has no live
 * connection and no grace period running.
 *
 * Device presence means "connected": joining marks a member present, and a dropped connection
 * marks them absent after its grace period. But a server restart drops every connection
 * without running the disconnect handler, so members who don't come back would stay present,
 * and count toward quorum, for the rest of the meeting. Members the chair marked present stay
 * present. Each write re-checks when it is applied, in case the member reconnects first.
 *
 * @returns the state after the last write, or null if nothing changed
 */
export async function markDisconnectedMembersAbsent(
  meetingCode: string,
  state: MeetingState,
): Promise<{ state: MeetingState; stateVersion: number } | null> {
  let latest: { state: MeetingState; stateVersion: number } | null = null;
  const stale = state.members.filter((m) => isStale(meetingCode, m));

  for (const member of stale) {
    const result = await applyAction(
      meetingCode,
      {
        type: 'SET_MEMBER_PRESENCE',
        memberId: member.id,
        present: false,
        timestamp: new Date().toISOString(),
      },
      (current) => {
        const now = current.members.find((m) => m.id === member.id);
        return now && isStale(meetingCode, now)
          ? { valid: true }
          : { valid: false, error: 'Member reconnected' };
      },
    );
    if (result.success) {
      latest = { state: result.state, stateVersion: result.stateVersion };
    }
  }
  return latest;
}

/** The meetings with a reconcile waiting */
const pending = new Set<string>();

/**
 * Reconcile a meeting's presence once the grace period has passed: after a server restart
 * there are no grace timers, so members who were connected get the same time to come back
 * before they are marked absent. Called on each join; one reconcile waits per meeting.
 */
export function scheduleReconcile(
  io: TypedServer,
  meetingCode: string,
  delayMs: number = PRESENCE_GRACE_MS,
): void {
  if (pending.has(meetingCode)) return;
  pending.add(meetingCode);
  const timer = setTimeout(() => {
    pending.delete(meetingCode);
    runEvent('presence reconcile', reconcile(io, meetingCode));
  }, delayMs);
  timer.unref?.();
}

async function reconcile(io: TypedServer, meetingCode: string): Promise<void> {
  const meeting = await getStorage().getMeeting(meetingCode);
  if (!meeting) return;
  const reconciled = await markDisconnectedMembersAbsent(meetingCode, meeting.state);
  if (reconciled) {
    emitState(io, meetingCode, reconciled);
  }
}
