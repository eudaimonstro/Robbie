import { MOTIONS } from './motions.js';

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
  fixTimeAdjourn: {
    name: 'Fix the time to adjourn to',
    explanation: 'Set when to meet again to finish this business',
  },
  adjourn: { name: 'Adjourn', explanation: 'End the meeting now' },
  recess: { name: 'Recess', explanation: 'Take a short break' },
  questionPrivilege: {
    name: 'Question of privilege',
    explanation: 'Raise an urgent problem, like noise or the room',
  },
  callOrderDay: {
    name: 'Call for the orders of the day',
    explanation: 'Ask the chair to return to the agenda',
  },
  appeal: {
    name: "Appeal the chair's ruling",
    explanation: 'Let the members decide instead of the chair',
  },
  objectionConsideration: {
    name: 'Object to considering it',
    explanation: 'Keep the meeting from taking up this motion at all',
  },
  pointInfo: {
    name: 'Request for information',
    explanation: 'Ask a question about the business at hand',
  },
  pointOrder: {
    name: 'Point of order',
    explanation: 'Say the rules are not being followed; the chair rules on it',
  },
  suspendRules: {
    name: 'Suspend the rules',
    explanation: 'Set a rule aside for one purpose',
  },
  withdrawMotion: {
    name: 'Permission to withdraw',
    explanation: 'The mover asks to take back a motion already stated',
  },
  divideQuestion: {
    name: 'Divide the question',
    explanation: 'Vote on the parts of the motion separately',
  },
  layOnTable: {
    name: 'Lay on the table',
    explanation: 'Set the question aside to take up later',
  },
  previousQuestion: {
    name: 'Close debate',
    explanation: 'Stop debate and vote now (two thirds)',
  },
  limitDebate: {
    name: 'Limit or extend debate',
    explanation: 'Change how long or how often people may speak',
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
  takeFromTable: {
    name: 'Take from the table',
    explanation: 'Bring back a question that was set aside',
  },
  reconsider: { name: 'Reconsider', explanation: 'Vote again on a question already decided' },
  adoptAgenda: { name: 'Adopt the agenda', explanation: 'Approve the order of business' },
  amendAgenda: { name: 'Amend the agenda', explanation: 'Add, remove or reorder agenda items' },
};

/** A motion's plain words; a motion without them falls back to its name and its help */
export function motionWords(key: string): MotionWords {
  return WORDS[key] ?? { name: MOTIONS[key]?.name ?? key, explanation: MOTIONS[key]?.help ?? '' };
}

/**
 * A motion's plain name, from its key or, for a record that keeps only the book's name, from
 * that name; a name that is neither is put in sentence case
 */
export function plainMotionName(name: string, key?: string): string {
  const known =
    key && MOTIONS[key] ? key : Object.keys(MOTIONS).find((k) => MOTIONS[k].name === name);
  if (known) return motionWords(known).name;
  return name.charAt(0) + name.slice(1).toLowerCase();
}
