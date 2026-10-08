import type { TextAmendment } from '../types/index.js';
import { MAX_MOTION_TEXT_LENGTH } from '../constants/limits.js';

/** Where words occur in a text, exactly as given: each start, without overlaps */
function positions(text: string, words: string): number[] {
  const found: number[] = [];
  if (!words) return found;
  for (let at = text.indexOf(words); at >= 0; at = text.indexOf(words, at + words.length)) {
    found.push(at);
  }
  return found;
}

/** One space between words, none before punctuation */
function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

/** Words added at the end of a text, before its closing punctuation if it has one */
function atTheEnd(text: string, words: string): string {
  const trimmed = text.trim();
  const closing = trimmed.match(/[.!?]$/)?.[0] ?? '';
  const body = closing ? trimmed.slice(0, -1) : trimmed;
  return tidy(`${body} ${words}${closing}`);
}

/**
 * The text as the amendment would make it, or null when it can't apply: the words it strikes or
 * inserts after are not there exactly once
 */
export function applyTextAmendment(text: string, change: TextAmendment): string | null {
  switch (change.form) {
    case 'substitute':
      return tidy(change.insert);
    case 'insert': {
      const after = change.after?.trim();
      if (!after) return atTheEnd(text, change.insert.trim());
      const at = positions(text, after);
      if (at.length !== 1) return null;
      const end = at[0] + after.length;
      return tidy(`${text.slice(0, end)} ${change.insert.trim()} ${text.slice(end)}`);
    }
    case 'strike':
    case 'strikeInsert': {
      const strike = change.strike.trim();
      const at = positions(text, strike);
      if (at.length !== 1) return null;
      const insert = change.form === 'strikeInsert' ? ` ${change.insert.trim()} ` : ' ';
      return tidy(`${text.slice(0, at[0])}${insert}${text.slice(at[0] + strike.length)}`);
    }
  }
}

/** The amendment in words, as it is moved, put and minuted: 'Strike "May" and insert "June"' */
export function describeTextAmendment(change: TextAmendment): string {
  const q = (words: string) => `"${tidy(words)}"`;
  switch (change.form) {
    case 'insert':
      return change.after?.trim()
        ? `Insert ${q(change.insert)} after ${q(change.after)}`
        : `Insert ${q(change.insert)} at the end`;
    case 'strike':
      return `Strike ${q(change.strike)}`;
    case 'strikeInsert':
      return `Strike ${q(change.strike)} and insert ${q(change.insert)}`;
    case 'substitute':
      return `Replace the text with ${q(change.insert)}`;
  }
}

/** Whether an amendment inserts words (which a secondary amendment can change) */
export function insertsWords(change: TextAmendment | undefined): boolean {
  return !!change && change.form !== 'strike';
}

/**
 * Why an amendment can't apply to a text, or null when it can: words missing, words not in the
 * text exactly once, a change that changes nothing or leaves nothing, or a result too long
 */
export function textAmendmentProblem(text: string, change: TextAmendment): string | null {
  const blank = (words: string | undefined) => !words || !words.trim();
  if ((change.form === 'strike' || change.form === 'strikeInsert') && blank(change.strike)) {
    return 'Give the words to strike';
  }
  if (change.form !== 'strike' && blank(change.insert)) {
    return change.form === 'substitute' ? 'Give the new text' : 'Give the words to insert';
  }
  const anchor =
    change.form === 'strike' || change.form === 'strikeInsert'
      ? change.strike.trim()
      : change.form === 'insert'
        ? change.after?.trim()
        : undefined;
  if (anchor) {
    const count = positions(text, anchor).length;
    if (count === 0) return `"${anchor}" is not in the words being amended`;
    if (count > 1) return `"${anchor}" appears more than once: give more of the words around it`;
  }
  const result = applyTextAmendment(text, change);
  if (result === null) return 'The amendment does not fit the words being amended';
  if (!result) return 'The amendment would strike every word: vote the motion down instead';
  if (result === tidy(text)) return 'The amendment changes nothing';
  if (result.length > MAX_MOTION_TEXT_LENGTH) {
    return `As amended the words would be longer than ${MAX_MOTION_TEXT_LENGTH} characters`;
  }
  return null;
}

/**
 * A primary amendment with the words it inserts changed by a secondary amendment, or null when
 * the secondary amendment can't apply
 */
export function amendInsertedWords(
  primary: TextAmendment,
  secondary: TextAmendment,
): TextAmendment | null {
  if (primary.form === 'strike') return null;
  const insert = applyTextAmendment(primary.insert, secondary);
  return insert === null ? null : { ...primary, insert };
}
