import type { BylawAmendment } from '../types/index.js';
import { MAX_MOTION_TEXT_LENGTH } from '../constants/limits.js';

/**
 * Bylaw amendment motions: the words of the motion and the text the room votes on, from the
 * change the motion carries (see BylawAmendment). The question card, the minutes and the server
 * all read the change through these, so what is moved, shown, recorded and applied is the same.
 */

/** A section as the meeting names it: 'Section 4.2 "Quorum"' */
export function sectionLabel(section: {
  numberLabel: string | null | undefined;
  title: string | null | undefined;
}): string {
  const number = section.numberLabel?.trim();
  const title = section.title?.trim();
  if (number && title) return `${number} "${title}"`;
  if (number) return number;
  if (title) return `"${title}"`;
  return 'an untitled section';
}

/** Text cut to a length, with an ellipsis when cut */
function within(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The words of a bylaw amendment motion: 'I move to amend the bylaws by modifying Section 4.2
 * "Quorum"', with the proposed amendment it moves when there is one. The server sets the
 * motion's text from these, never from the mover's device.
 */
export function bylawMotionText(change: BylawAmendment): string {
  const target = change.targetSectionLabel ?? 'the section';
  let words: string;
  switch (change.changeType) {
    case 'add': {
      const under = change.parentSectionLabel ? ` under ${change.parentSectionLabel}` : '';
      const title = change.newTitle?.trim() ? `: "${change.newTitle.trim()}"` : '';
      words = `I move to amend the bylaws by adding a new section${under}${title}`;
      break;
    }
    case 'modify':
      // A change of title or number alone says so
      words =
        change.newContent !== undefined
          ? `I move to amend the bylaws by modifying ${target}`
          : change.newTitle !== undefined
            ? `I move to amend the bylaws by retitling ${target} "${change.newTitle}"`
            : `I move to amend the bylaws by renumbering ${target} as ${change.newNumberLabel ?? ''}`;
      break;
    case 'delete':
      words = `I move to amend the bylaws by deleting ${target}`;
      break;
    case 'renumber':
      words = `I move to amend the bylaws by renumbering ${target} as ${change.newNumberLabel ?? ''}`;
      break;
  }
  const proposed = change.amendmentTitle ? `, as proposed in "${change.amendmentTitle}"` : '';
  return within(`${words.trimEnd()}${proposed}`, MAX_MOTION_TEXT_LENGTH);
}

/** A section's title and text */
export interface SectionText {
  title?: string;
  text?: string;
}

/** What a bylaw amendment changes, as the question card shows it and the minutes record it */
export interface BylawChangeView {
  /** The section changed, or where an added section goes */
  heading: string;
  /** "To read", "To add", "To strike out", "To renumber as Section 4.3" */
  action: string;
  /** The section as it reads now, for a change or a deletion */
  current: SectionText | null;
  /** The section as it would read, for a change or an addition */
  proposed: SectionText | null;
}

const present = (text: SectionText): SectionText | null =>
  text.title || text.text
    ? {
        ...(text.title ? { title: text.title } : {}),
        ...(text.text ? { text: text.text } : {}),
      }
    : null;

/** The text a bylaw amendment motion puts before the meeting */
export function bylawChangeView(change: BylawAmendment): BylawChangeView {
  const target = change.targetSectionLabel ?? 'The section';
  const current = present({ title: change.currentTitle, text: change.currentContent });
  switch (change.changeType) {
    case 'add': {
      const title = [change.newNumberLabel?.trim(), change.newTitle?.trim()]
        .filter(Boolean)
        .join(' ');
      return {
        heading: change.parentSectionLabel
          ? `A new section under ${change.parentSectionLabel}`
          : 'A new section at the top level',
        action: 'To add',
        current: null,
        proposed: present({ title, text: change.newContent }),
      };
    }
    case 'modify':
      // The text unchanged: only the new title or number, never the text as if it were new
      if (change.newContent === undefined) {
        return {
          heading: target,
          action:
            change.newTitle !== undefined
              ? `To be titled "${change.newTitle}"`
              : `To renumber as ${change.newNumberLabel ?? ''}`.trimEnd(),
          current: null,
          proposed: null,
        };
      }
      return {
        heading: target,
        action: 'To read',
        current,
        proposed: present({
          title: change.newTitle ?? change.currentTitle,
          text: change.newContent,
        }),
      };
    case 'delete':
      return { heading: target, action: 'To strike out', current, proposed: null };
    case 'renumber':
      return {
        heading: target,
        action: `To renumber as ${change.newNumberLabel ?? ''}`.trimEnd(),
        current: null,
        proposed: null,
      };
  }
}
