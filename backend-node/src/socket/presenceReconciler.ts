import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { roomManager } from './roomManager.js';
import { applyAction } from './stateManager.js';

/**
 * Mark absent every member the state shows as present who has no live connection.
 *
 * Presence means "connected": joining marks a member present and disconnecting marks them
 * absent. But a server restart drops every connection without running the disconnect
 * handler, so members who don't come back would stay present, and count toward quorum,
 * for the rest of the meeting. Each write re-checks the connection when it is applied,
 * in case the member reconnects first.
 *
 * @returns the state after the last write, or null if nothing changed
 */
export async function markDisconnectedMembersAbsent(
  meetingCode: string,
  state: MeetingState,
): Promise<{ state: MeetingState; stateVersion: number } | null> {
  let latest: { state: MeetingState; stateVersion: number } | null = null;
  const stale = state.members.filter(
    (m) => m.present && !roomManager.isMemberConnected(meetingCode, m.id),
  );

  for (const member of stale) {
    const result = await applyAction(
      meetingCode,
      {
        type: 'SET_MEMBER_PRESENCE',
        memberId: member.id,
        present: false,
        timestamp: new Date().toISOString(),
      },
      () =>
        roomManager.isMemberConnected(meetingCode, member.id)
          ? { valid: false, error: 'Member reconnected' }
          : { valid: true },
    );
    if (result.success) {
      latest = { state: result.state, stateVersion: result.stateVersion };
    }
  }
  return latest;
}
