import type { MeetingState } from '@robbie-bylawyer/shared/types';
import type { StateTailField, StateUpdatePayload } from '@robbie-bylawyer/shared/types/socket';

/**
 * The whole state after a server update, from the state the client has (at `version`): an update
 * sends the meeting log and the record of decided motions as what was added since the update
 * before it, and leaves out the members, the agenda, the attendance and the previous minutes while
 * they are unchanged. The screens read the whole state, as before.
 *
 * Null when this client can't apply it (it doesn't have the update before it, or its history is
 * shorter than the update's start): the client asks for the whole state instead.
 */
export function mergeStateUpdate(
  current: MeetingState,
  version: number,
  update: StateUpdatePayload,
): MeetingState | null {
  const { tails, unchanged } = update;
  if (!tails && !unchanged) return update.state;
  if (update.baseVersion !== undefined && update.baseVersion > version) return null;

  const next: MeetingState = { ...update.state };
  for (const [field, start] of Object.entries(tails ?? {}) as Array<[StateTailField, number]>) {
    if (start > current[field].length) return null;
    if (field === 'meetingLog') {
      next.meetingLog = [...current.meetingLog.slice(0, start), ...update.state.meetingLog];
    } else {
      next.completedMotions = [
        ...current.completedMotions.slice(0, start),
        ...update.state.completedMotions,
      ];
    }
  }
  for (const field of unchanged ?? []) {
    (next as unknown as Record<string, unknown>)[field] = current[field];
  }
  return next;
}
