/**
 * The shape of every action a client can send, checked at the socket boundary before anything
 * else reads it (see handleDispatchAction). Each action is a strict object: an unknown key, a
 * prototype key, a value of the wrong type, a string longer than its bound or an array or record
 * larger than its bound refuses the whole action. Fields the server sets (who is acting, the
 * time, the ids of new items) are accepted only in their own shape and are overwritten by the
 * enricher; the validator then decides whether the action is in order.
 *
 * ACTION_SCHEMAS has an entry for every action type (the compiler checks it), so a new action
 * can't skip one. Actions only the server applies refuse every client payload.
 */

import { z } from 'zod';
import type { MeetingAction } from '@robbie-bylawyer/shared/types';
import {
  MAX_BYLAW_LABEL_LENGTH,
  MAX_BYLAW_TEXT_LENGTH,
  MAX_BYLAW_TITLE_LENGTH,
  MAX_FLOOR_NAME_LENGTH,
  MAX_AGENDA_TITLE_LENGTH,
  MAX_MOTION_TEXT_LENGTH,
  MAX_POSITION_LENGTH,
  MOTIONS,
} from '@robbie-bylawyer/shared/constants';
import { MAX_SEATS } from '@robbie-bylawyer/shared/utils';
import {
  MAX_CORRECTIONS_LENGTH,
  MAX_FLOOR_COUNT,
  MAX_HEADCOUNT,
  MAX_RULING_EXPLANATION_LENGTH,
} from './actionValidator.js';

/** A person's name: a member's, a nominee's, a candidate's or a proxy's */
const MAX_NAME_LENGTH = MAX_FLOOR_NAME_LENGTH;
/** A candidate's name as the tellers count it (a write-in can be longer than a member's name) */
const MAX_CANDIDATE_LENGTH = 200;
/** An office, a committee */
const MAX_TITLE_LENGTH = MAX_POSITION_LENGTH;
/** A question to the chair, a rule suspension's purpose, a reason */
const MAX_SHORT_TEXT_LENGTH = 500;
/** The chair's answer to a question */
const MAX_ANSWER_LENGTH = 1000;
/** A committee report's summary or recommendations */
const MAX_REPORT_LENGTH = 2000;
/** A clock time without a date (generateTimestamp), or an ISO time */
const MAX_TIMESTAMP_LENGTH = 64;
/** A Bylawyer id (a UUID) */
const MAX_ID_LENGTH = 64;
/** The most names the chair can give with a headcount */
const MAX_HEADCOUNT_NAMES = 500;
/** The most candidates in a floor ballot count */
const MAX_BALLOT_CANDIDATES = 100;
/** The most parts a question can be divided into */
const MAX_DIVIDED_PARTS = 20;
/** The longest a speaker or vote timer can run, in seconds (a day) */
const MAX_TIME_LIMIT_SECONDS = 86_400;

/** Keys that would reach an object's prototype if a reader used them as a lookup */
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const text = (max: number) => z.string().max(max);
const id = z.int();
const count = z.int().min(0).max(MAX_FLOOR_COUNT);
const timestamp = text(MAX_TIMESTAMP_LENGTH);
const optionalId = id.optional();
const optionalName = text(MAX_NAME_LENGTH).optional();
/** An epoch time in milliseconds when a timer ends, or null for none */
const timerEnd = z.number().nonnegative().nullable();

const vote = z.enum(['yea', 'nay', 'abstain']);
const stance = z.enum(['pro', 'con', 'neutral']);
const meetingRole = z.enum(['chair', 'admin', 'member', 'guest']);
const proxyScope = z.enum(['all', 'single-vote']);
const motionType = z.enum(Object.keys(MOTIONS) as [string, ...string[]]);

/**
 * A member as the state has it, echoed back by a client (the speaker the chair recognizes): an
 * unknown field is dropped rather than refused, so a member saved with a field since retired can
 * still be named. The server takes the member from the state by id anyway.
 */
const member = z.object({
  id,
  name: text(MAX_NAME_LENGTH),
  role: meetingRole,
  present: z.boolean(),
  presentBy: z.enum(['device', 'chair']).optional(),
});

const ruleSuspension = z.strictObject({
  id,
  rule: z.enum([
    'pro-con-alternation',
    'second-requirement',
    'motion-precedence',
    'amendment-depth',
    'motion-renewal',
    'chair-voting-restriction',
    'motion-maker-priority',
    'mover-cannot-second',
    'debate-rules',
    'order-of-business',
  ]),
  purpose: text(MAX_SHORT_TEXT_LENGTH),
  specificAction: text(MAX_SHORT_TEXT_LENGTH),
  scope: z.enum(['single-action', 'meeting-remainder']),
  suspendedAt: timestamp,
  actionCompleted: z.boolean().optional(),
  motionId: id,
});

const agendaAmendment = z.strictObject({
  action: z.enum(['add', 'remove', 'reorder']),
  title: text(MAX_AGENDA_TITLE_LENGTH).optional(),
  position: z.union([z.enum(['beginning', 'end']), z.int().min(0)]).optional(),
  itemId: optionalId,
  fromIndex: z.int().min(0).optional(),
  toIndex: z.int().min(0).optional(),
});

const bylawId = text(MAX_ID_LENGTH);

/** The change a bylaw amendment motion proposes; the fields the server sets are overwritten */
const bylawAmendment = z.strictObject({
  documentId: bylawId.min(1),
  documentTitle: text(MAX_BYLAW_TITLE_LENGTH).optional(),
  amendmentId: bylawId.min(1).optional(),
  amendmentTitle: text(MAX_BYLAW_TITLE_LENGTH).optional(),
  changeType: z.enum(['add', 'modify', 'delete', 'renumber']),
  targetSectionId: bylawId.optional(),
  targetSectionLabel: text(MAX_BYLAW_LABEL_LENGTH + MAX_BYLAW_TITLE_LENGTH + 3).optional(),
  currentTitle: text(MAX_BYLAW_TITLE_LENGTH).optional(),
  currentContent: text(MAX_BYLAW_TEXT_LENGTH).optional(),
  newContent: text(MAX_BYLAW_TEXT_LENGTH).optional(),
  newNumberLabel: text(MAX_BYLAW_LABEL_LENGTH).optional(),
  newTitle: text(MAX_BYLAW_TITLE_LENGTH).optional(),
  parentSectionId: bylawId.optional(),
  parentSectionLabel: text(MAX_BYLAW_LABEL_LENGTH + MAX_BYLAW_TITLE_LENGTH + 3).optional(),
});

/** An amendment's change to the words of the motion it amends */
const words = text(MAX_MOTION_TEXT_LENGTH);
const textAmendment = z.discriminatedUnion('form', [
  z.strictObject({ form: z.literal('insert'), insert: words, after: words.optional() }),
  z.strictObject({ form: z.literal('strike'), strike: words }),
  z.strictObject({ form: z.literal('strikeInsert'), strike: words, insert: words }),
  z.strictObject({ form: z.literal('substitute'), insert: words }),
]);

/** A time in words: "8:30 PM", "after the treasurer's report" */
const MAX_WHEN_LENGTH = 100;

/** When a question is postponed to */
const postponement = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('next-meeting') }),
  z.strictObject({ kind: z.literal('later'), when: text(MAX_WHEN_LENGTH) }),
]);

/** The details some motions carry (MotionDetails) */
const motionDetails = {
  textAmendment: textAmendment.optional(),
  postponeTo: postponement.optional(),
  referTo: text(MAX_TITLE_LENGTH).optional(),
  recessUntil: text(MAX_WHEN_LENGTH).optional(),
  agendaAmendment: agendaAmendment.optional(),
  ruleSuspension: ruleSuspension.partial().optional(),
  bylawAmendment: bylawAmendment.optional(),
  tabledMotionId: optionalId,
  reconsideredMotionId: optionalId,
  dividedParts: z.array(text(MAX_MOTION_TEXT_LENGTH)).max(MAX_DIVIDED_PARTS).optional(),
};

/** Counts by candidate name: names bounded, and none that is a prototype key */
const ballotCounts = z
  .record(
    text(MAX_CANDIDATE_LENGTH).refine((name) => !PROTOTYPE_KEYS.has(name), 'Not a name'),
    count,
  )
  .refine((counts) => Object.keys(counts).length <= MAX_BALLOT_CANDIDATES, 'Too many names');

const committeeReport = z.strictObject({
  id,
  committee: text(MAX_TITLE_LENGTH),
  presenter: text(MAX_NAME_LENGTH),
  summary: text(MAX_REPORT_LENGTH),
  recommendations: text(MAX_REPORT_LENGTH).optional(),
  presented: z.boolean(),
});

/** An action only the server applies: no client payload is accepted */
const serverOnly = z.never();

/** An action with nothing but its type and the time */
const timed = <T extends string>(type: T) => z.strictObject({ type: z.literal(type), timestamp });

/** The same, decided at a time the server records (CLOCKED_ACTIONS) */
const clocked = <T extends string>(type: T) =>
  z.strictObject({ type: z.literal(type), at: timestamp.optional(), timestamp });

type ActionType = MeetingAction['type'];
type ActionOf<K extends ActionType> = Extract<MeetingAction, { type: K }>;

/**
 * A schema for each action type: what it accepts must fit the action's type (its keys and their
 * types), though a field the server sets may be left out
 */
type ActionSchemaMap = {
  [K in ActionType]: z.ZodType<Partial<ActionOf<K>> & { type: K }> | typeof serverOnly;
};

export const ACTION_SCHEMAS = {
  START_MEETING: timed('START_MEETING'),
  END_MEETING: timed('END_MEETING'),
  MAKE_MOTION: z.strictObject({
    type: z.literal('MAKE_MOTION'),
    motionType,
    text: text(MAX_MOTION_TEXT_LENGTH),
    mover: optionalName,
    moverId: optionalId,
    motionId: id,
    timestamp,
    putByChair: z.boolean().optional(),
    ...motionDetails,
  }),
  MAKE_FLOOR_MOTION: z.strictObject({
    type: z.literal('MAKE_FLOOR_MOTION'),
    motionType,
    text: text(MAX_MOTION_TEXT_LENGTH),
    moverName: text(MAX_NAME_LENGTH),
    moverMemberId: optionalId,
    motionId: id,
    recordedBy: optionalId,
    timestamp,
    ...motionDetails,
  }),
  SECOND_MOTION: z.strictObject({
    type: z.literal('SECOND_MOTION'),
    seconder: optionalName,
    seconderId: optionalId,
    timestamp,
  }),
  SECOND_FROM_FLOOR: z.strictObject({
    type: z.literal('SECOND_FROM_FLOOR'),
    seconderName: optionalName,
    seconderMemberId: optionalId,
    recordedBy: optionalId,
    timestamp,
  }),
  DECLINE_SECOND: clocked('DECLINE_SECOND'),
  OPEN_VOTING: z.strictObject({
    type: z.literal('OPEN_VOTING'),
    voteTimerEnd: timerEnd,
    confirmedWithoutQuorum: z.boolean().optional(),
    timestamp,
  }),
  CAST_VOTE: z.strictObject({
    type: z.literal('CAST_VOTE'),
    vote,
    voterId: optionalId,
    isChairDecidingVote: z.boolean().optional(),
    timestamp: timestamp.optional(),
  }),
  CLOSE_VOTING: z.strictObject({
    type: z.literal('CLOSE_VOTING'),
    declared: z.enum(['ayes', 'noes']).optional(),
    at: timestamp.optional(),
    timestamp,
  }),
  SET_FLOOR_TALLY: z.strictObject({
    type: z.literal('SET_FLOOR_TALLY'),
    yea: count,
    nay: count,
    abstain: count,
    timestamp,
  }),
  RAISE_HAND: z.strictObject({ type: z.literal('RAISE_HAND'), member: member.optional(), stance }),
  LOWER_HAND: z.strictObject({ type: z.literal('LOWER_HAND'), member: member.optional() }),
  RECOGNIZE_SPEAKER: z.strictObject({
    type: z.literal('RECOGNIZE_SPEAKER'),
    member,
    stance,
    speakerTimerEnd: timerEnd,
    timestamp,
  }),
  YIELD_FLOOR: z.strictObject({
    type: z.literal('YIELD_FLOOR'),
    yieldedBy: optionalId,
    timestamp,
  }),
  ADD_AGENDA_ITEM: z.strictObject({
    type: z.literal('ADD_AGENDA_ITEM'),
    title: text(MAX_AGENDA_TITLE_LENGTH),
    itemId: id,
  }),
  REMOVE_AGENDA_ITEM: z.strictObject({ type: z.literal('REMOVE_AGENDA_ITEM'), id }),
  ADOPT_AGENDA: z.strictObject({
    type: z.literal('ADOPT_AGENDA'),
    confirmedWithoutQuorum: z.boolean().optional(),
    at: timestamp.optional(),
    timestamp,
  }),
  AGENDA_OBJECTION: z.strictObject({
    type: z.literal('AGENDA_OBJECTION'),
    objectorId: optionalId,
    timestamp,
  }),
  CALL_AGENDA_ITEM: z.strictObject({ type: z.literal('CALL_AGENDA_ITEM'), id, timestamp }),
  COMPLETE_AGENDA_ITEM: z.strictObject({
    type: z.literal('COMPLETE_AGENDA_ITEM'),
    id,
    timestamp,
  }),
  REORDER_AGENDA: z.strictObject({
    type: z.literal('REORDER_AGENDA'),
    fromIndex: z.int().min(0),
    toIndex: z.int().min(0),
  }),
  SET_SPEAKER_TIME_LIMIT: z.strictObject({
    type: z.literal('SET_SPEAKER_TIME_LIMIT'),
    seconds: z.int().min(0).max(MAX_TIME_LIMIT_SECONDS),
  }),
  SET_VOTE_TIME_LIMIT: z.strictObject({
    type: z.literal('SET_VOTE_TIME_LIMIT'),
    seconds: z.int().min(0).max(MAX_TIME_LIMIT_SECONDS),
  }),
  REQUEST_UNANIMOUS_CONSENT: timed('REQUEST_UNANIMOUS_CONSENT'),
  OBJECT_TO_CONSENT: z.strictObject({
    type: z.literal('OBJECT_TO_CONSENT'),
    objector: optionalName,
    objectorId: optionalId,
    fromFloor: z.boolean().optional(),
    floorObjector: optionalName,
    timestamp,
  }),
  UNANIMOUS_CONSENT_PASSED: z.strictObject({
    type: z.literal('UNANIMOUS_CONSENT_PASSED'),
    confirmedWithoutQuorum: z.boolean().optional(),
    at: timestamp.optional(),
    timestamp,
  }),
  SET_VOTING_METHOD: z.strictObject({
    type: z.literal('SET_VOTING_METHOD'),
    method: z.enum(['standard', 'voice', 'ballot', 'rollcall']),
  }),
  ADVANCE_MEETING_STAGE: timed('ADVANCE_MEETING_STAGE'),
  SET_MEETING_STAGE: z.strictObject({
    type: z.literal('SET_MEETING_STAGE'),
    stage: z.enum([
      'not-started',
      'call-to-order',
      'minutes-approval',
      'reports',
      'special-orders',
      'unfinished-business',
      'new-business',
      'announcements',
      'adjourned',
    ]),
    timestamp,
  }),
  SET_QUORUM: z.strictObject({
    type: z.literal('SET_QUORUM'),
    quorum: z.int().min(0).max(MAX_HEADCOUNT),
    timestamp,
  }),
  APPROVE_MINUTES: z.strictObject({
    type: z.literal('APPROVE_MINUTES'),
    corrections: text(MAX_CORRECTIONS_LENGTH).optional(),
    at: timestamp.optional(),
    timestamp,
  }),
  SET_PREVIOUS_MINUTES: serverOnly,
  ADD_COMMITTEE_REPORT: z.strictObject({
    type: z.literal('ADD_COMMITTEE_REPORT'),
    report: committeeReport,
  }),
  PRESENT_COMMITTEE_REPORT: z.strictObject({
    type: z.literal('PRESENT_COMMITTEE_REPORT'),
    reportId: id,
    timestamp,
  }),
  SUSPEND_RULE_APPROVED: z.strictObject({
    type: z.literal('SUSPEND_RULE_APPROVED'),
    suspension: ruleSuspension,
    timestamp,
  }),
  RESTORE_RULE: z.strictObject({ type: z.literal('RESTORE_RULE'), suspensionId: id, timestamp }),
  CHAIR_RULING: z.strictObject({
    type: z.literal('CHAIR_RULING'),
    ruling: z.enum(['sustain', 'overrule', 'allow', 'deny']),
    outOfOrder: z.boolean().optional(),
    explanation: text(MAX_RULING_EXPLANATION_LENGTH).optional(),
    at: timestamp.optional(),
    timestamp,
  }),
  OPEN_NOMINATIONS: z.strictObject({
    type: z.literal('OPEN_NOMINATIONS'),
    position: text(MAX_TITLE_LENGTH),
    seats: z.number().int().min(1).max(MAX_SEATS).optional(),
    timestamp,
  }),
  NOMINATE: z.strictObject({
    type: z.literal('NOMINATE'),
    position: text(MAX_TITLE_LENGTH),
    nomineeName: text(MAX_NAME_LENGTH),
    nomineeId: id,
    nominatedBy: optionalName,
    nominatorId: optionalId,
    nominationId: id,
    fromFloor: z.boolean().optional(),
    timestamp,
  }),
  DECLINE_NOMINATION: z.strictObject({
    type: z.literal('DECLINE_NOMINATION'),
    nominationId: id,
    declinedBy: optionalId,
    timestamp,
  }),
  CLOSE_NOMINATIONS: timed('CLOSE_NOMINATIONS'),
  START_ELECTION: z.strictObject({
    type: z.literal('START_ELECTION'),
    electionId: id,
    position: text(MAX_TITLE_LENGTH),
    requiredVotes: z.enum(['majority', 'plurality', '2/3']),
    confirmedWithoutQuorum: z.boolean().optional(),
    timestamp,
  }),
  CAST_BALLOT: z.strictObject({
    type: z.literal('CAST_BALLOT'),
    candidateName: text(MAX_CANDIDATE_LENGTH).optional(),
    candidateNames: z.array(text(MAX_CANDIDATE_LENGTH)).min(1).max(MAX_SEATS).optional(),
    voterId: optionalId,
  }),
  CLOSE_ELECTION: timed('CLOSE_ELECTION'),
  SET_FLOOR_BALLOTS: z.strictObject({
    type: z.literal('SET_FLOOR_BALLOTS'),
    counts: ballotCounts,
    writeIns: ballotCounts.optional(),
    blank: count.optional(),
    illegal: count.optional(),
    ballots: count.optional(),
    timestamp,
  }),
  DECLARE_ELECTED: z.strictObject({
    type: z.literal('DECLARE_ELECTED'),
    candidateName: text(MAX_CANDIDATE_LENGTH),
    at: timestamp.optional(),
    timestamp,
  }),
  ELECT_BY_ACCLAMATION: z.strictObject({
    type: z.literal('ELECT_BY_ACCLAMATION'),
    electionId: id,
    confirmedWithoutQuorum: z.boolean().optional(),
    at: timestamp.optional(),
    timestamp,
  }),
  SET_ASIDE_ELECTION: clocked('SET_ASIDE_ELECTION'),
  ASK_INQUIRY: z.strictObject({
    type: z.literal('ASK_INQUIRY'),
    inquiryType: z.enum(['parliamentary', 'information', 'privilege']),
    question: text(MAX_SHORT_TEXT_LENGTH),
    askedBy: optionalName,
    askerId: optionalId,
    inquiryId: id,
    timestamp,
  }),
  ANSWER_INQUIRY: z.strictObject({
    type: z.literal('ANSWER_INQUIRY'),
    inquiryId: id,
    answer: text(MAX_ANSWER_LENGTH),
    answeredBy: optionalName,
    timestamp,
  }),
  SET_MEMBER_ROLE: z.strictObject({
    type: z.literal('SET_MEMBER_ROLE'),
    targetMemberId: id,
    newRole: z.enum(['member', 'chair', 'admin']),
    previousChairId: optionalId,
    changedBy: optionalName,
    changedById: optionalId,
    timestamp,
  }),
  ADD_MEMBER: serverOnly,
  SET_MEMBER_PRESENCE: serverOnly,
  REFRESH_MEMBERS: serverOnly,
  MARK_PRESENT: z.strictObject({
    type: z.literal('MARK_PRESENT'),
    userId: id,
    member: member.optional(),
    timestamp,
  }),
  SET_HEADCOUNT: z.strictObject({
    type: z.literal('SET_HEADCOUNT'),
    count: z.int().min(0).max(MAX_HEADCOUNT),
    names: z.array(text(MAX_NAME_LENGTH)).max(MAX_HEADCOUNT_NAMES),
    timestamp,
  }),
  RELOAD_AGENDA: serverOnly,
  SET_MEETING_INFO: serverOnly,
  WITHDRAW_MOTION: z.strictObject({
    type: z.literal('WITHDRAW_MOTION'),
    requesterId: optionalId,
    fromFloor: z.boolean().optional(),
    motionId: optionalId,
    at: timestamp.optional(),
    timestamp,
  }),
  MODIFY_MOTION: z.strictObject({
    type: z.literal('MODIFY_MOTION'),
    requesterId: optionalId,
    newText: text(MAX_MOTION_TEXT_LENGTH),
    timestamp,
  }),
  TAKE_UP_POSTPONED: z.strictObject({
    type: z.literal('TAKE_UP_POSTPONED'),
    motionId: id,
    timestamp,
  }),
  RESUME_MEETING: clocked('RESUME_MEETING'),
  REQUEST_DIVISION: z.strictObject({
    type: z.literal('REQUEST_DIVISION'),
    requesterId: optionalId,
    fromFloor: z.boolean().optional(),
    timestamp,
  }),
  START_ROLL_CALL: timed('START_ROLL_CALL'),
  RESPOND_ROLL_CALL: z.strictObject({
    type: z.literal('RESPOND_ROLL_CALL'),
    memberId: optionalId,
    status: z.enum(['present', 'absent', 'excused', 'not-responded']),
    timestamp,
  }),
  COMPLETE_ROLL_CALL: timed('COMPLETE_ROLL_CALL'),
  MARK_ABSENT: z.strictObject({
    type: z.literal('MARK_ABSENT'),
    memberId: id,
    excused: z.boolean(),
    timestamp,
  }),
  SET_AUTO_YIELD: z.strictObject({ type: z.literal('SET_AUTO_YIELD'), enabled: z.boolean() }),
  SET_PROXY_SETTINGS: z.strictObject({
    type: z.literal('SET_PROXY_SETTINGS'),
    allowProxyVoting: z.boolean(),
    maxProxiesPerMember: z.int().min(0).max(MAX_HEADCOUNT),
    proxiesCountForQuorum: z.boolean(),
    allowMemberProxyGrant: z.boolean().optional(),
    timestamp,
  }),
  GRANT_PROXY: z.strictObject({
    type: z.literal('GRANT_PROXY'),
    proxyId: id,
    grantedBy: id,
    grantedTo: id,
    grantedByName: text(MAX_NAME_LENGTH),
    grantedToName: text(MAX_NAME_LENGTH),
    scope: proxyScope,
    timestamp,
  }),
  REVOKE_PROXY: z.strictObject({ type: z.literal('REVOKE_PROXY'), proxyId: id, timestamp }),
  CAST_PROXY_VOTE: z.strictObject({
    type: z.literal('CAST_PROXY_VOTE'),
    vote,
    forMemberId: id,
    castById: optionalId,
    timestamp,
  }),
  REQUEST_PROXY: z.strictObject({
    type: z.literal('REQUEST_PROXY'),
    requestId: id,
    requestedBy: optionalId,
    requestedByName: optionalName,
    requestedFor: id,
    requestedForName: text(MAX_NAME_LENGTH),
    scope: proxyScope,
    timestamp,
  }),
  ACCEPT_PROXY: z.strictObject({
    type: z.literal('ACCEPT_PROXY'),
    requestId: id,
    proxyId: id,
    acceptedBy: optionalId,
    timestamp,
  }),
  DECLINE_PROXY: z.strictObject({
    type: z.literal('DECLINE_PROXY'),
    requestId: id,
    reason: text(MAX_SHORT_TEXT_LENGTH).optional(),
    declinedBy: optionalId,
    timestamp,
  }),
  CANCEL_PROXY_REQUEST: z.strictObject({
    type: z.literal('CANCEL_PROXY_REQUEST'),
    requestId: id,
    canceledBy: optionalId,
    timestamp,
  }),
} satisfies ActionSchemaMap;

/**
 * The keys each schema accepts that its action's type doesn't have: none, for every action (a
 * schema can't take in a field the reducer and validator don't know about)
 */
type ExtraKeys = {
  [K in ActionType]: (typeof ACTION_SCHEMAS)[K] extends typeof serverOnly
    ? never
    : Exclude<keyof z.input<(typeof ACTION_SCHEMAS)[K]>, keyof ActionOf<K>>;
};
const noExtraKeys: { [K in ActionType]: never } = null as unknown as ExtraKeys;
void noExtraKeys;

export type ActionParseResult =
  { success: true; action: MeetingAction } | { success: false; error: string };

/** Why an action was refused, short enough to send back and show */
function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'The action is not valid';
  const path = issue.path.map(String).join('.');
  return path ? `Invalid ${path}: ${issue.message}`.slice(0, 200) : issue.message.slice(0, 200);
}

/** Whether a key that reaches a prototype appears anywhere in a parsed JSON value */
function hasPrototypeKey(value: unknown, depth = 0): boolean {
  if (typeof value !== 'object' || value === null) return false;
  // Deeper than any action goes: refused as malformed
  if (depth > 8) return true;
  return Object.keys(value).some(
    (key) =>
      PROTOTYPE_KEYS.has(key) ||
      hasPrototypeKey((value as Record<string, unknown>)[key], depth + 1),
  );
}

/**
 * The action a client sent, checked against its type's schema: a type that isn't an action
 * (looked up as the map's own key, so no prototype key gets through), a prototype key anywhere
 * in it, or anything the schema refuses, is refused with a short reason
 */
export function parseClientAction(action: unknown): ActionParseResult {
  if (typeof action !== 'object' || action === null || Array.isArray(action)) {
    return { success: false, error: 'An action must be an object' };
  }
  const type = (action as { type?: unknown }).type;
  if (typeof type !== 'string' || !Object.hasOwn(ACTION_SCHEMAS, type)) {
    return { success: false, error: 'Unknown action type' };
  }
  // A record's schema would drop such a key silently; refuse the action instead
  if (hasPrototypeKey(action)) {
    return { success: false, error: 'The action has a key that is not allowed' };
  }
  const schema: z.ZodType = ACTION_SCHEMAS[type as ActionType];
  const parsed = schema.safeParse(action);
  if (!parsed.success) {
    return { success: false, error: describeIssue(parsed.error) };
  }
  return { success: true, action: parsed.data as MeetingAction };
}

/** Whether a string is an action type (an own key of the schema map, never a prototype key) */
export function isActionType(type: unknown): type is ActionType {
  return typeof type === 'string' && Object.hasOwn(ACTION_SCHEMAS, type);
}
