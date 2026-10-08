import type {
  AgendaItem,
  CompletedMotion,
  MeetingState,
  Motion,
  Postponement,
} from '../../types/index.js';
import {
  amendInsertedWords,
  applyTextAmendment,
  describeTextAmendment,
} from '../../utils/textAmendment.js';
import { moveItem } from '../../utils/moveItem.js';
import { decisionContext, unvotedRecord } from './records.js';

/** The motions that are business of their own, which postponing or referring takes away */
const MAIN_BUSINESS = new Set(['mainMotion', 'bylawAmendment']);
/** The motions that change the words of the motion beneath them */
const AMENDMENTS = new Set(['amend', 'amendAmendment']);

/** What deciding a question did: the motions left pending, the records, and what else changed */
interface Outcome {
  stack: Motion[];
  /** Records of motions it disposed of besides the one decided (the main motion postponed) */
  records: CompletedMotion[];
  fields: Partial<MeetingState>;
  /** Lines for the log after the decision's own */
  log: string[];
}

/** The motion at the top of the stack, replaced */
function withTop(stack: Motion[], top: Motion): Motion[] {
  return [...stack.slice(0, -1), top];
}

/** "the next meeting", "8:30 PM" */
export function postponedToText(to: Postponement | undefined): string {
  return !to || to.kind === 'next-meeting' ? 'the next meeting' : to.when.trim();
}

/**
 * The main motion and what adheres to it leave the floor: postponed, postponed indefinitely or
 * referred, with a record saying so and naming the amendments that went with it
 */
function disposeOfMain(
  state: MeetingState,
  stack: Motion[],
  decided: Motion,
  timestamp: string,
  at: string | undefined,
): Outcome {
  let index = -1;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (MAIN_BUSINESS.has(stack[i].type)) {
      index = i;
      break;
    }
  }
  if (index < 0) return { stack, records: [], fields: {}, log: [] };
  const question = stack.slice(index);
  const [main, ...adhering] = question;
  const pendingAmendments = adhering.filter((m) => AMENDMENTS.has(m.type)).map((m) => m.text);
  const amendments = pendingAmendments.length > 0 ? { pendingAmendments } : {};
  const fields: Partial<MeetingState> = {};
  let record: CompletedMotion;
  let line: string;
  switch (decided.type) {
    case 'postponeDefinite': {
      const to: Postponement = decided.postponeTo ?? { kind: 'next-meeting' };
      record = unvotedRecord(state, main, 'postponed', timestamp, at, {
        postponedTo: to,
        ...amendments,
      });
      line = `The motion is postponed to ${postponedToText(to)}.`;
      // Later in this meeting: the chair takes it up again, as it was
      if (to.kind === 'later') {
        fields.postponedMotions = [
          ...(state.postponedMotions ?? []),
          { motions: question.map((m) => ({ ...m, debateClosed: false })), when: to.when.trim() },
        ];
      }
      break;
    }
    case 'referCommittee': {
      const to = decided.referTo?.trim() || 'a committee';
      record = unvotedRecord(state, main, 'referred', timestamp, at, {
        referredTo: to,
        ...amendments,
      });
      line = `The motion is referred to ${to}.`;
      break;
    }
    default:
      record = unvotedRecord(state, main, 'postponed-indefinitely', timestamp, at, amendments);
      line = 'The motion is postponed indefinitely.';
  }
  return { stack: stack.slice(0, index), records: [record], fields, log: [line] };
}

/** The agenda as an adopted amendment of it leaves it */
function amendedAgenda(agenda: AgendaItem[], motion: Motion): AgendaItem[] {
  const amendment = motion.agendaAmendment;
  if (!amendment) return agenda;
  if (amendment.action === 'add' && amendment.title) {
    const item: AgendaItem = {
      id: amendment.itemId || 0,
      title: amendment.title,
      status: 'pending',
    };
    if (amendment.position === 'beginning') return [item, ...agenda];
    if (typeof amendment.position === 'number') {
      return [...agenda.slice(0, amendment.position), item, ...agenda.slice(amendment.position)];
    }
    return [...agenda, item];
  }
  if (amendment.action === 'remove') return agenda.filter((item) => item.id !== amendment.itemId);
  if (amendment.action === 'reorder') {
    return moveItem(agenda, amendment.fromIndex ?? -1, amendment.toIndex ?? -1);
  }
  return agenda;
}

/** What adopting the decided motion does to the business beneath it (RONR 10 to 21) */
function adopt(
  state: MeetingState,
  decided: Motion,
  stack: Motion[],
  timestamp: string,
  at: string | undefined,
): Outcome {
  const none: Outcome = { stack, records: [], fields: {}, log: [] };
  const top = stack.at(-1);
  switch (decided.type) {
    // An amendment rewrites the words of the motion beneath it, which is then the question
    case 'amend': {
      if (!top || !decided.textAmendment) return none;
      const text = applyTextAmendment(top.text, decided.textAmendment);
      if (text === null) return none;
      const amended = { ...top, text, originalText: top.originalText ?? top.text };
      return { ...none, stack: withTop(stack, amended), log: [`The motion now reads: "${text}"`] };
    }
    case 'amendAmendment': {
      if (!top?.textAmendment || !decided.textAmendment) return none;
      const change = amendInsertedWords(top.textAmendment, decided.textAmendment);
      if (!change) return none;
      const text = describeTextAmendment(change);
      const amended = {
        ...top,
        textAmendment: change,
        text,
        originalText: top.originalText ?? top.text,
      };
      return {
        ...none,
        stack: withTop(stack, amended),
        log: [`The amendment now reads: ${text}`],
      };
    }
    // Debate on the question beneath ends: it is put to the vote
    case 'previousQuestion':
      if (!top) return none;
      return {
        ...none,
        stack: withTop(stack, { ...top, debateClosed: true }),
        log: ['Debate is closed.'],
      };
    case 'postponeDefinite':
    case 'postponeIndefinitely':
    case 'referCommittee':
      return disposeOfMain(state, stack, decided, timestamp, at);
    case 'recess':
      return {
        ...none,
        fields: {
          recess: { since: timestamp, until: decided.recessUntil?.trim() || null },
          recesses: [
            ...(state.recesses ?? []),
            { ...(at ? { startedAt: at } : {}), ...decisionContext(state, undefined) },
          ],
        },
        log: ['The meeting is in recess.'],
      };
    // The chair declares the meeting adjourned next (END_MEETING), which records what is left
    case 'adjourn':
      return {
        ...none,
        fields: { adjournmentCarried: true },
        log: ['The motion to adjourn carried: the chair declares the meeting adjourned.'],
      };
    case 'adoptAgenda':
      return {
        ...none,
        fields: {
          agendaAdopted: true,
          agendaObjection: false,
          agendaAdoption: { how: 'motion', ...(at ? { decidedAt: at } : {}) },
        },
      };
    case 'amendAgenda':
      return { ...none, fields: { agenda: amendedAgenda(state.agenda, decided) } };
    // The mover's request to withdraw is granted: the motion beneath leaves the floor
    case 'withdrawMotion':
      if (!top) return none;
      return {
        ...none,
        stack: stack.slice(0, -1),
        records: [unvotedRecord(state, top, 'withdrawn', timestamp, at)],
        log: [`The motion is withdrawn: "${top.text}"`],
      };
    default:
      return none;
  }
}

/**
 * The question pending is decided (CLOSE_VOTING, UNANIMOUS_CONSENT_PASSED): it leaves the stack
 * with its record, and if it was adopted it does what it does. An appeal that reverses an out of
 * order ruling puts the motion ruled out of order back. A request to withdraw leaves no record of
 * its own: the motion withdrawn has one. Debate on the decided question is over; none of it
 * carries to the next one.
 *
 * @param passed - adopted; for an appeal, the chair's ruling sustained
 */
export function decide(
  state: MeetingState,
  passed: boolean,
  record: CompletedMotion,
  timestamp: string,
  at: string | undefined,
): { state: Partial<MeetingState>; log: string } {
  const decided = state.currentMotion;
  const stack = state.motionStack.slice(0, -1);
  let outcome: Outcome = { stack, records: [], fields: {}, log: [] };
  if (decided?.type === 'appeal') {
    const removed = state.lastChairRuling?.removed;
    if (!passed && removed) {
      outcome = removed.awaitingSecond
        ? {
            ...outcome,
            fields: { pendingSecond: removed.motion },
            log: [
              `The motion ruled out of order is before the meeting again: "${removed.motion.text}"`,
            ],
          }
        : {
            ...outcome,
            stack: [...stack, removed.motion],
            log: [
              `The motion ruled out of order is before the meeting again: "${removed.motion.text}"`,
            ],
          };
    }
  } else if (decided && passed) {
    outcome = adopt(state, decided, stack, timestamp, at);
  }
  const own = decided?.type === 'withdrawMotion' ? [] : [record];
  return {
    state: {
      motionStack: outcome.stack,
      currentMotion: outcome.stack.at(-1) ?? null,
      completedMotions: [...state.completedMotions, ...own, ...outcome.records],
      lastChairRuling: decided?.type === 'appeal' ? null : state.lastChairRuling,
      debatePositions: {},
      speakerQueue: [],
      recognizedSpeaker: null,
      speakerTimerEnd: null,
      lastSpeakerStance: null,
      ...outcome.fields,
    },
    log: outcome.log.map((line) => `\n${line}`).join(''),
  };
}
