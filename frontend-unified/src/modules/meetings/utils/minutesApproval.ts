import type { MeetingState } from '@robbie-bylawyer/shared/types';

/** An agenda item for the minutes: "Approval of the minutes of the 2025 annual meeting" */
const MINUTES_ITEM = /\bminutes\b/i;

/**
 * Whether the approval of the previous minutes is the business now: the meeting is at its
 * minutes-approval stage or has called an agenda item about the minutes, and no question is
 * pending (a motion made during the item comes first)
 */
export function minutesItemUnderWay(state: MeetingState): boolean {
  const atMinutes =
    state.meetingStage === 'minutes-approval' ||
    MINUTES_ITEM.test(state.currentAgendaItem?.title ?? '');
  return (
    state.meetingActive &&
    atMinutes &&
    !state.currentMotion &&
    !state.pendingSecond &&
    !state.votingOpen
  );
}

/** The minutes' title: their first heading that names them, or a plain description */
export function minutesHeading(markdown: string): string {
  for (const line of markdown.split('\n')) {
    const heading = /^#{1,6}\s+(.+)$/.exec(line.trim())?.[1]?.trim();
    if (heading && /minutes/i.test(heading)) return heading;
  }
  return 'The minutes of the previous meeting';
}
