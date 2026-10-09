import type { MeetingState, Motion, MotionDetails } from '../types/index.js';
import { MOTIONS } from '../constants/motions.js';
import { motionWords } from '../constants/motionWords.js';
import { describeTextAmendment, insertsWords } from './textAmendment.js';

/**
 * The motions Robbie offers, in the order a phone lists them: the ones an HOA meeting uses, each
 * correct end to end (docs/design/2026-10-08-meeting-rules-design.md). The one other
 * motion in MOTIONS, a request to withdraw (withdrawMotion), is made by WITHDRAW_MOTION, never
 * moved.
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

/** Why a bylaw amendment's words can't be changed in the meeting */
const BYLAW_WORDING_FIXED =
  "A bylaw amendment's words come from its text: withdraw it and move it again";

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
  // The one motion not offered: a request to withdraw, which WITHDRAW_MOTION makes
  if (!isOffered(type)) {
    return out(
      `${named(type)} isn't offered in Robbie: the mover asks to withdraw their motion`,
      'not-offered',
    );
  }
  // The members amend the bylaws; the board only carries them out
  if (type === 'bylawAmendment' && state.board) {
    return out(
      "The members amend the bylaws: a bylaw amendment isn't moved in a board meeting",
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
  if (state.votingOpen || state.currentElection?.votingInProgress) {
    return out('No motion can be made while a vote or a ballot is open', 'voting');
  }
  if (state.pendingSecond) {
    return out('Another motion is waiting for a second', 'awaiting-second');
  }
  if (type === 'appeal') {
    if (state.motionStack.some((m) => m.type === 'appeal')) {
      return out('An appeal is pending: the meeting decides it first', 'precedence');
    }
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
        return out(BYLAW_WORDING_FIXED, 'precedence');
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
        return out(BYLAW_WORDING_FIXED, 'precedence');
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

/**
 * The words a motion with details of its own is moved with, from those details, so the question
 * card, the stamp and the minutes all read the same: 'Strike "May" and insert "June"', "Postpone
 * it to the next meeting", "Refer it to the board", "Recess until 8:15 PM". Null for a motion whose
 * words are the mover's.
 */
export function motionTextFromDetails(type: string, details: MotionDetails): string | null {
  switch (type) {
    case 'amend':
    case 'amendAmendment':
      return details.textAmendment ? describeTextAmendment(details.textAmendment) : null;
    case 'postponeDefinite':
      if (!details.postponeTo) return null;
      return details.postponeTo.kind === 'next-meeting'
        ? 'Postpone it to the next meeting'
        : `Postpone it to ${details.postponeTo.when.trim()}`;
    case 'referCommittee':
      return details.referTo?.trim() ? `Refer it to ${details.referTo.trim()}` : null;
    case 'recess':
      return details.recessUntil?.trim() ? `Recess until ${details.recessUntil.trim()}` : null;
    default:
      return null;
  }
}

/**
 * How the open vote is counted now: a voice vote on which a member called for a division is
 * counted (on devices and in the room), for that vote only
 */
export function votingMethodNow(state: MeetingState): MeetingState['votingMethod'] {
  return state.votingMethod === 'voice' && state.divisionCalled ? 'standard' : state.votingMethod;
}

/**
 * Why the pending motion can't be put to the meeting, when it is one Robbie no longer offers
 * (from a live meeting saved before the motions were trimmed); null otherwise
 */
export function pendingNotOffered(state: MeetingState): string | null {
  const motion = state.currentMotion;
  if (!motion || motion.vote === 'none' || motion.type === 'withdrawMotion') return null;
  if (isOffered(motion.type)) return null;
  return `${named(motion.type)} isn't offered in Robbie any more: the mover withdraws it, or a point of order has it ruled out of order`;
}
