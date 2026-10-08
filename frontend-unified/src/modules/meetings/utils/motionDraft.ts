import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import { motionTextFromDetails, textAmendmentProblem } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MotionDetails, TextAmendment } from '@robbie-bylawyer/shared/types';

/** What someone is filling in to make a motion: its words, and the details some motions need */
export interface MotionDraft {
  /** The words of a main motion, a point of order, or any other motion's own words */
  text: string;
  /** An amendment's change */
  form: TextAmendment['form'];
  strike: string;
  insert: string;
  after: string;
  /** A postponement: to the next meeting, or later in this one */
  postpone: 'next-meeting' | 'later';
  when: string;
  /** Who a referral goes to */
  referTo: string;
  /** When a recess ends (a time input's "20:15") */
  recessUntil: string;
}

export const EMPTY_DRAFT: MotionDraft = {
  text: '',
  form: 'strikeInsert',
  strike: '',
  insert: '',
  after: '',
  postpone: 'next-meeting',
  when: '',
  referTo: '',
  recessUntil: '',
};

/** The words an amendment changes: the motion's, or for an amendment of one, the words it inserts */
export function amendedWords(state: MeetingState, type: string): string | null {
  const pending = state.currentMotion;
  if (!pending) return null;
  if (type === 'amend') return pending.text;
  if (type === 'amendAmendment') {
    return pending.textAmendment && pending.textAmendment.form !== 'strike'
      ? pending.textAmendment.insert
      : null;
  }
  return null;
}

/** "20:15" from a time input, as "8:15 PM" */
function clockWords(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return time.trim();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function textAmendmentOf(draft: MotionDraft): TextAmendment {
  switch (draft.form) {
    case 'insert':
      return {
        form: 'insert',
        insert: draft.insert,
        ...(draft.after.trim() && { after: draft.after }),
      };
    case 'strike':
      return { form: 'strike', strike: draft.strike };
    case 'substitute':
      return { form: 'substitute', insert: draft.insert };
    default:
      return { form: 'strikeInsert', strike: draft.strike, insert: draft.insert };
  }
}

/** A motion ready to make, or what it still needs */
export type DraftResult = { text: string; details: MotionDetails } | { problem: string };

/**
 * The motion a draft makes: its words, and its details for an amendment, a postponement, a
 * referral or a recess (the server words those from their details, as here). A main motion and
 * a point of order need their words; the rest fall back on their standard phrase.
 */
export function motionFromDraft(
  type: string,
  draft: MotionDraft,
  state: MeetingState,
): DraftResult {
  const phrase = MOTIONS[type]?.phrase ?? '';
  const own = draft.text.trim();
  let details: MotionDetails = {};
  switch (type) {
    case 'mainMotion':
      return own ? { text: own, details } : { problem: 'Write the motion' };
    case 'pointOrder':
      return own ? { text: own, details } : { problem: 'Say what is out of order' };
    case 'amend':
    case 'amendAmendment': {
      const words = amendedWords(state, type);
      const change = textAmendmentOf(draft);
      const problem =
        words === null ? 'There are no words to amend' : textAmendmentProblem(words, change);
      if (problem) return { problem };
      details = { textAmendment: change };
      break;
    }
    case 'postponeDefinite':
      if (draft.postpone === 'later' && !draft.when.trim()) return { problem: 'Say when' };
      details = {
        postponeTo:
          draft.postpone === 'later'
            ? { kind: 'later', when: draft.when.trim() }
            : { kind: 'next-meeting' },
      };
      break;
    case 'referCommittee':
      if (!draft.referTo.trim()) return { problem: 'Say who it goes to' };
      details = { referTo: draft.referTo.trim() };
      break;
    case 'recess':
      if (draft.recessUntil) details = { recessUntil: clockWords(draft.recessUntil) };
      break;
  }
  return { text: motionTextFromDetails(type, details) ?? (own || phrase), details };
}
