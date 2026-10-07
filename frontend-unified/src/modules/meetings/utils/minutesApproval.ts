import {
  LOG_MINUTES_APPROVED,
  getStageLogMessage,
  logAgendaItemCalled,
  logMinutesApprovedWithCorrections,
} from '@robbie-bylawyer/shared/constants';
import type { MeetingState } from '@robbie-bylawyer/shared/types';

/**
 * A length of time in a title, which says nothing about the minutes of a meeting: "Homeowner
 * forum (3 minutes per speaker)", "Treasurer's report (five minutes)". Not a year: "Approval of
 * the 2025 minutes" is about them.
 */
const DURATION =
  /\b(?:\d{1,3}|a few|few|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty)[\s-]*minutes?\b/gi;

/** The title without its lengths of time */
function withoutDurations(title: string): string {
  return title.replace(DURATION, '');
}

/**
 * Whether an agenda item's title is about the minutes of a meeting: it names them (not as a
 * length of time) and says it approves, corrects or reads them, or is the minutes themselves
 * ("Approval of the minutes of the 2025 annual meeting", "Reading and correction of minutes",
 * "Minutes")
 */
export function titleIsTheMinutes(title: string): boolean {
  const words = withoutDurations(title);
  if (!/\bminutes\b/i.test(words)) return false;
  return /approv|correct|\bread/i.test(words) || /^\W*(?:the\s+)?minutes\b/i.test(words);
}

/**
 * Whether there are previous minutes before the meeting: their text for members, and only their
 * id for guests and the display (the server keeps the text from them)
 */
function minutesToApprove(state: MeetingState): boolean {
  return !!state.previousMinutesId || !!state.minutesFromPreviousMeeting;
}

/**
 * Whether the approval of the previous minutes is the business now: the meeting is at its
 * minutes-approval stage, or has called an agenda item about the minutes while there are minutes
 * to approve; and no question is pending (a motion made during the item comes first)
 */
export function minutesItemUnderWay(state: MeetingState): boolean {
  const atMinutes =
    state.meetingStage === 'minutes-approval' ||
    (minutesToApprove(state) && titleIsTheMinutes(state.currentAgendaItem?.title ?? ''));
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
  return titleIsTheMinutes(title) && /\bapprov/i.test(withoutDurations(title));
}

/**
 * Where the minutes last became the news in the meeting log: the line that called their item (or
 * began their stage), or the line that approved them. A decision logged after it is newer than
 * the minutes; -1 without such a line.
 */
export function minutesLatestLine(state: MeetingState): number {
  const item = state.currentAgendaItem;
  const called = item ? logAgendaItemCalled(item.title) : null;
  const stage = getStageLogMessage('minutes-approval');
  const approvedWithCorrections = logMinutesApprovedWithCorrections('');
  return state.meetingLog.findLastIndex(
    ({ message }) =>
      message === called ||
      message === stage ||
      message === LOG_MINUTES_APPROVED ||
      message.startsWith(approvedWithCorrections),
  );
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
