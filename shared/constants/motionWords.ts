import { MOTIONS, RETIRED_MOTIONS } from './motions.js';

/** A motion in plain words: its name in sentence case, and what it does in one short line */
export interface MotionWords {
  name: string;
  explanation: string;
}

/**
 * Every motion a member can be offered, in the words a homeowner uses. The question card keeps
 * the book's names; these are for choosing a motion to make, and for the minutes.
 */
const WORDS: Record<string, MotionWords> = {
  mainMotion: { name: 'Main motion', explanation: 'Bring new business before the meeting' },
  adjourn: { name: 'Adjourn', explanation: 'End the meeting now' },
  recess: { name: 'Recess', explanation: 'Take a short break' },
  appeal: {
    name: "Appeal the chair's ruling",
    explanation: 'Let the members decide instead of the chair',
  },
  pointOrder: {
    name: 'Point of order',
    explanation: 'Say the rules are not being followed; the chair rules on it',
  },
  withdrawMotion: {
    name: 'Permission to withdraw',
    explanation: 'The mover asks to take back a motion already stated',
  },
  previousQuestion: {
    name: 'Close debate',
    explanation: 'Stop debate and vote now (two thirds)',
  },
  postponeDefinite: {
    name: 'Postpone',
    explanation: 'Put the question off to later or to the next meeting',
  },
  referCommittee: {
    name: 'Refer to a committee or the board',
    explanation: 'Send the question to a committee or the board to study',
  },
  amend: { name: 'Amend', explanation: 'Change the words of the motion' },
  amendAmendment: {
    name: 'Amend the amendment',
    explanation: 'Change the words the amendment would insert',
  },
  postponeIndefinitely: {
    name: 'Postpone indefinitely',
    explanation: 'Drop the question without voting on it directly',
  },
  bylawAmendment: {
    name: 'Amend the bylaws',
    explanation: 'Propose a change to a section of the bylaws',
  },
  adoptAgenda: { name: 'Adopt the agenda', explanation: 'Approve the order of business' },
  amendAgenda: { name: 'Amend the agenda', explanation: 'Add, remove or reorder agenda items' },
};

/**
 * A motion's plain words; a motion without them falls back to its name and its help, and one
 * Robbie no longer has (from a saved meeting) to its retired name
 */
export function motionWords(key: string): MotionWords {
  return (
    WORDS[key] ?? {
      name: MOTIONS[key]?.name ?? RETIRED_MOTIONS[key]?.name ?? key,
      explanation: MOTIONS[key]?.help ?? '',
    }
  );
}

/**
 * A motion's plain name, from its key or, for a record that keeps only the book's name, from
 * that name; a name that is neither is put in sentence case
 */
export function plainMotionName(name: string, key?: string): string {
  const known =
    key && (MOTIONS[key] || RETIRED_MOTIONS[key])
      ? key
      : Object.keys(MOTIONS).find((k) => MOTIONS[k].name === name);
  if (known) return motionWords(known).name;
  return name.charAt(0) + name.slice(1).toLowerCase();
}
