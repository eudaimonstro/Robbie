import type { MeetingState, Motion } from '../types/index.js';
import { MOTIONS } from '../constants/motions.js';
import { motionWords } from '../constants/motionWords.js';
import { insertsWords } from './textAmendment.js';

/**
 * The motions Robbie offers, in the order a phone lists them: the ones an HOA meeting uses, each
 * correct end to end (docs/superpowers/specs/2026-10-08-meeting-rules-design.md). The rest of
 * MOTIONS is kept for the records and saved meetings that name them, and refused.
 */
export const OFFERED_MOTIONS: readonly string[] = [
  'mainMotion',
  'bylawAmendment',
  'adoptAgenda',
  'amendAgenda',
  'amend',
  'amendAmendment',
  'previousQuestion',
  'postponeDefinite',
  'postponeIndefinitely',
  'referCommittee',
  'recess',
  'adjourn',
  'pointOrder',
  'appeal',
];

/** What to do instead of a motion Robbie doesn't offer */
const INSTEAD: Record<string, string> = {
  layOnTable: 'postpone the question to later in the meeting instead',
  takeFromTable: 'the chair takes up a postponed question instead',
  reconsider: 'a decision stands until a later meeting changes it',
  suspendRules: 'the meeting follows its rules as they are',
  divideQuestion: 'amend the motion, or move its parts as separate motions',
  objectionConsideration: 'vote the motion down, or postpone it indefinitely',
  callOrderDay: 'raise a point of order, or ask the chair',
  fixTimeAdjourn: 'adjourn, and schedule the next meeting',
  limitDebate: 'the chair sets the speaking time, and close debate ends it',
  pointInfo: 'ask the chair your question',
  questionPrivilege: 'ask the chair: a question of privilege is a request the chair answers',
  withdrawMotion: 'the mover asks to withdraw their motion',
};

/** Why a motion can't be made now, and what kind of reason it is */
export interface OutOfOrder {
  reason: string;
  kind:
    | 'unknown'
    | 'not-offered'
    | 'not-in-session'
    | 'adjourning'
    | 'recess'
    | 'point-pending'
    | 'voting'
    | 'awaiting-second'
    | 'election'
    | 'agenda'
    | 'agenda-adopted'
    | 'debate-closed'
    | 'precedence';
}

/** Whether Robbie offers a motion */
export function isOffered(type: string): boolean {
  return OFFERED_MOTIONS.includes(type);
}

/** The motions that are business of their own (an agenda adoption is the agenda's) */
const MAIN_BUSINESS = new Set(['mainMotion', 'bylawAmendment']);

/** The motions that adhere to a main motion, and go with it when it is postponed or referred */
const ADHERING = new Set(['amend', 'amendAmendment', 'postponeIndefinitely']);

/** A pending motion's rank, from its definition (a saved motion may predate a change to it) */
function rankOf(motion: Motion): number {
  return MOTIONS[motion.type]?.precedence ?? motion.precedence;
}

/** A motion's plain name, starting a sentence */
function named(type: string): string {
  return motionWords(type).name;
}

/** A point of order (or a request saved before they were questions to the chair) awaits a ruling */
export function awaitingRuling(state: MeetingState): boolean {
  return state.currentMotion?.vote === 'none';
}

/** An election from nominations to the declaration holds the floor */
function electionUnderway(state: MeetingState): boolean {
  return state.nominationsOpen || !!state.currentNominationPosition || !!state.currentElection;
}

/** The main motion the pending subsidiary motions apply to, if any */
export function pendingMainMotion(state: MeetingState): Motion | null {
  for (let i = state.motionStack.length - 1; i >= 0; i--) {
    if (MAIN_BUSINESS.has(state.motionStack[i].type)) return state.motionStack[i];
  }
  return null;
}

const out = (reason: string, kind: OutOfOrder['kind']): OutOfOrder => ({ reason, kind });

/**
 * Why a motion can't be made now, or null when it is in order. One rule for the screens (which
 * offer only the motions in order) and the server (which refuses the rest), after RONR 5 to 6:
 *
 * - Only in session, not in a recess, and not once an adjournment has carried
 * - A point of order at any time, even during a vote or while a motion awaits a second, unless
 *   one is before the chair; while one is, nothing else until the chair rules
 * - Nothing else during a vote or while a motion awaits a second
 * - An appeal only at once after a ruling
 * - An election holds the floor: only adjourn and recess interrupt it
 * - A main motion only with nothing pending and the agenda adopted
 * - A subsidiary motion applies to a pending motion and outranks it; after debate is closed on a
 *   question, none applies to it
 * - Adjourn and recess outrank the pending question
 */
export function motionOutOfOrder(state: MeetingState, type: string): OutOfOrder | null {
  const definition = MOTIONS[type];
  if (!definition) return out(`Unknown motion: ${type}`, 'unknown');
  if (!isOffered(type)) {
    const instead = INSTEAD[type];
    return out(
      `${named(type)} isn't offered in Robbie${instead ? `: ${instead}` : ''}`,
      'not-offered',
    );
  }
  if (!state.meetingActive) return out('The meeting is not in session', 'not-in-session');
  if (state.adjournmentCarried) {
    return out('The meeting has voted to adjourn: the chair declares it adjourned', 'adjourning');
  }
  if (state.recess) return out('The meeting is in recess', 'recess');

  const current = state.currentMotion;
  if (type === 'pointOrder') {
    return awaitingRuling(state)
      ? out('The chair is ruling on a point of order', 'point-pending')
      : null;
  }
  if (awaitingRuling(state)) {
    return out('The chair rules on the point of order first', 'point-pending');
  }
  if (state.votingOpen) {
    return out('No motion can be made while a vote is in progress', 'voting');
  }
  if (state.pendingSecond) {
    return out('Another motion is waiting for a second', 'awaiting-second');
  }
  if (type === 'appeal') {
    return state.lastChairRuling
      ? null
      : out('An appeal is made at once, after a ruling of the chair', 'precedence');
  }
  if (electionUnderway(state) && definition.category !== 'privileged') {
    return out('Finish or set aside the election first', 'election');
  }

  if (definition.category === 'privileged') {
    return current && definition.precedence <= rankOf(current)
      ? out(`${named(type)} is not in order while ${named(current.type)} is pending`, 'precedence')
      : null;
  }

  if (type === 'adoptAgenda') {
    if (state.agendaAdopted) return out('The agenda is adopted', 'agenda-adopted');
    if (current) return out('Settle the pending motion first', 'precedence');
    if (!state.agendaObjection) {
      return out('The chair asks to adopt the agenda without objection first', 'agenda');
    }
    return null;
  }
  if (type === 'amendAgenda') {
    if (state.agendaAdopted) return out('The agenda is adopted', 'agenda-adopted');
    if (current?.type === 'adoptAgenda') return null;
    if (!current && state.agendaObjection) return null;
    return out("Amend the agenda is in order while the agenda's adoption is pending", 'agenda');
  }
  if (definition.category === 'main') {
    if (current) {
      return out('One main motion at a time: settle the pending motion first', 'precedence');
    }
    if (!state.agendaAdopted) return out('Adopt the agenda first', 'agenda');
    return null;
  }

  // Subsidiary motions: each applies to a pending motion it outranks
  if (!current)
    return out(`There is no motion for ${named(type).toLowerCase()} to apply to`, 'precedence');
  if (current.debateClosed) {
    return out('Debate is closed: the question is put to the vote now', 'debate-closed');
  }
  switch (type) {
    case 'amend':
      if (current.type === 'amend') {
        return out('An amendment is pending: amend it, or decide it first', 'precedence');
      }
      if (current.type === 'amendAmendment') {
        return out('An amendment of the amendment is pending: decide it first', 'precedence');
      }
      if (current.type === 'bylawAmendment') {
        return out(
          "A bylaw amendment's words come from its text: withdraw it and move it again",
          'precedence',
        );
      }
      if (current.type === 'adoptAgenda') {
        return out('Use Amend the agenda to change the agenda', 'precedence');
      }
      return current.type === 'mainMotion'
        ? null
        : out('Amend applies to a main motion', 'precedence');
    case 'amendAmendment':
      if (current.type === 'amendAmendment') {
        return out('Only one amendment of an amendment at a time', 'precedence');
      }
      if (current.type !== 'amend') {
        return out('Amend the amendment applies to a pending amendment', 'precedence');
      }
      if (state.motionStack.at(-2)?.type === 'bylawAmendment') {
        return out(
          "A bylaw amendment's words come from its text: withdraw it and move it again",
          'precedence',
        );
      }
      return current.textAmendment && !insertsWords(current.textAmendment)
        ? out('The amendment inserts no words to amend', 'precedence')
        : null;
    case 'previousQuestion':
      if (!current.debatable)
        return out('Close debate applies to a debatable question', 'precedence');
      break;
    case 'postponeIndefinitely':
      if (!MAIN_BUSINESS.has(current.type)) {
        return out(
          current.type === 'adoptAgenda'
            ? 'Postpone indefinitely applies to a main motion'
            : `Postpone indefinitely is not in order while ${named(current.type)} is pending`,
          'precedence',
        );
      }
      break;
    case 'postponeDefinite':
    case 'referCommittee':
      // They take the main motion and what adheres to it (amendments, postpone indefinitely)
      if (!pendingMainMotion(state)) {
        return out(`${named(type)} applies to a main motion`, 'precedence');
      }
      if (!MAIN_BUSINESS.has(current.type) && !ADHERING.has(current.type)) {
        return out(
          `${named(type)} is not in order while ${named(current.type)} is pending`,
          'precedence',
        );
      }
      break;
  }
  if (definition.precedence <= rankOf(current)) {
    return out(
      `${named(type)} is not in order while ${named(current.type)} is pending`,
      'precedence',
    );
  }
  return null;
}
