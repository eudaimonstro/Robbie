import type { CompletedMotion, Disposition, MeetingState, Motion } from '../../types/index.js';
import { attendanceSummary } from '../../utils/attendance.js';

/** Where and when a decision was made: the agenda item under way, and the server's clock */
export function decisionContext(
  state: MeetingState,
  at: string | undefined,
): { agendaItemId?: number; decidedAt?: string } {
  return {
    ...(state.currentAgendaItem ? { agendaItemId: state.currentAgendaItem.id } : {}),
    ...(at ? { decidedAt: at } : {}),
  };
}

/** Whether a quorum is present now, as the meeting counts it */
export function quorumNow(state: MeetingState): boolean {
  return attendanceSummary(state).hasQuorum;
}

/**
 * The record of a motion disposed of without a vote: adopted by unanimous consent, withdrawn,
 * or dead for want of a second. It has no votes, so nobody is on its prevailing side; only an
 * adopted one keeps its motion's reconsider flag.
 */
export function unvotedRecord(
  state: MeetingState,
  motion: Motion,
  disposition: Exclude<Disposition, 'carried' | 'failed'>,
  timestamp: string,
  at: string | undefined,
): CompletedMotion {
  const adopted = disposition === 'unanimous';
  return {
    id: motion.id,
    type: motion.type,
    name: motion.name,
    text: motion.text,
    passed: adopted,
    voterChoices: {},
    timestamp,
    reconsidered: false,
    reconsiderable: adopted && motion.reconsidered,
    mover: motion.mover,
    moverId: motion.moverId,
    ...(motion.secondedBy ? { seconder: motion.secondedBy } : {}),
    ...(motion.bylawAmendment ? { bylawAmendment: motion.bylawAmendment } : {}),
    disposition,
    ...(adopted ? { quorumPresent: quorumNow(state) } : {}),
    ...decisionContext(state, at),
  };
}

/**
 * The members who have attended, with this one among them while the meeting is in session
 * (from the call to order to the adjournment): someone there only before or after it didn't
 * attend the meeting
 */
export function withAttended(state: MeetingState, memberId: number): number[] {
  if (!state.meetingActive) return state.attendedIds;
  const attended = state.attendedIds ?? [];
  return attended.includes(memberId) ? attended : [...attended, memberId];
}

/** The members who have attended, with everyone present now among them (at the call to order) */
export function withPresentAttended(state: MeetingState): number[] {
  const attended = new Set(state.attendedIds ?? []);
  const arriving = state.members.filter((m) => m.present && !attended.has(m.id)).map((m) => m.id);
  return arriving.length > 0 ? [...(state.attendedIds ?? []), ...arriving] : state.attendedIds;
}
