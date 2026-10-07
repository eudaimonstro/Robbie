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

/**
 * Whether the agenda item under way says it approves the minutes ("Approval of the minutes of the
 * 2025 annual meeting"): the screens that show the item's line above the minutes don't label them
 * "Approval of the minutes" again
 */
export function agendaNamesTheApproval(state: MeetingState): boolean {
  const title = state.currentAgendaItem?.title ?? '';
  return MINUTES_ITEM.test(title) && /\bapprov/i.test(title);
}

/** The first heading that names the minutes: its line and its words */
function namingHeading(lines: string[]): { index: number; heading: string } | null {
  for (const [index, line] of lines.entries()) {
    const heading = /^#{1,6}\s+(.+)$/.exec(line.trim())?.[1]?.trim();
    if (heading && /minutes/i.test(heading)) return { index, heading };
  }
  return null;
}

/** The minutes' title: their first heading that names them, or a plain description */
export function minutesHeading(markdown: string): string {
  return namingHeading(markdown.split('\n'))?.heading ?? 'The minutes of the previous meeting';
}

/**
 * The minutes after that heading (and the organization's name above it), for a page that gives
 * their title already; minutes without one, as they are
 */
export function minutesBody(markdown: string): string {
  const lines = markdown.split('\n');
  const found = namingHeading(lines);
  return found
    ? lines
        .slice(found.index + 1)
        .join('\n')
        .trim()
    : markdown;
}
