/** At most this many people in one bulk addition (the server's MAX_BULK_PEOPLE) */
export const MAX_BULK_PEOPLE = 500;
/** The longest name a person can have (the meeting's MAX_NAME_LENGTH) */
export const MAX_PERSON_NAME = 100;

import { isEmailAddress } from '@robbie-bylawyer/shared/utils';

/**
 * One pasted line, read: the person on it (with what came after the email, left out: another
 * column of a spreadsheet), or what is wrong with it
 */
export type PastedLine =
  | { line: number; text: string; email: string; name: string; ignored?: string }
  | { line: number; text: string; problem: string };

/** An email address as it appears in a line: anything around one @ up to a separator */
const EMAIL_IN_TEXT = /[^\s<>,;:"'()[\]]+@[^\s<>,;:"'()[\]]+/g;
/** What separates a name from an email on a line: tabs, commas, semicolons, quotes, <> */
const SEPARATORS = /^[\s,;:<>"'()]+|[\s,;:<>"'()]+$/g;

/** A part of a line as a name: tabs as spaces, no separators at its ends */
const asName = (text: string) =>
  text
    .replace(/\t+/g, ' ')
    .replace(/<\s*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(SEPARATORS, '')
    .replace(/\s+,/g, ',');

/**
 * Read a pasted list of people, one per line: "Name, email", "Name <email>", a spreadsheet row
 * (cells separated by tabs), or just an email. Blank lines are skipped. The name is what comes
 * before the email; anything after it (a spreadsheet's other columns) is left out, and said so.
 * Each other line gives the person (the email lowercased) or the problem, in words: no email,
 * two emails, an email the server wouldn't take (the same check: isEmailAddress), a name too
 * long, an email listed on an earlier line.
 */
export function readPastedPeople(text: string): PastedLine[] {
  const seen = new Map<string, number>();
  const lines: PastedLine[] = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const emails = trimmed.match(EMAIL_IN_TEXT) ?? [];
    if (emails.length === 0) {
      lines.push({ line, text: trimmed, problem: 'No email address on this line' });
      continue;
    }
    if (emails.length > 1) {
      lines.push({ line, text: trimmed, problem: 'Two email addresses on one line' });
      continue;
    }
    const found = emails[0] ?? '';
    const email = found.replace(/\.$/, '').toLowerCase();
    if (!isEmailAddress(email)) {
      lines.push({ line, text: trimmed, problem: "That email address isn't complete" });
      continue;
    }
    const at = trimmed.indexOf(found);
    const name = asName(trimmed.slice(0, at));
    const ignored = asName(trimmed.slice(at + found.length));
    if ([...name].length > MAX_PERSON_NAME) {
      lines.push({
        line,
        text: trimmed,
        problem: `The name is longer than ${MAX_PERSON_NAME} characters`,
      });
      continue;
    }
    const earlier = seen.get(email);
    if (earlier !== undefined) {
      lines.push({ line, text: trimmed, problem: `Listed already, on line ${earlier}` });
      continue;
    }
    seen.set(email, line);
    lines.push({ line, text: trimmed, email, name, ...(ignored && { ignored }) });
  }
  return lines;
}
