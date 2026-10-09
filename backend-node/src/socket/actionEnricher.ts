import type { MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import type { SocketData } from '@robbie-bylawyer/shared/types/socket';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';

/** The ID field each item-creating action assigns to its new item */
const CREATED_ID_FIELDS: Partial<Record<MeetingAction['type'], string>> = {
  MAKE_MOTION: 'motionId',
  MAKE_FLOOR_MOTION: 'motionId',
  ADD_AGENDA_ITEM: 'itemId',
  NOMINATE: 'nominationId',
  START_ELECTION: 'electionId',
  ELECT_BY_ACCLAMATION: 'electionId',
  ASK_INQUIRY: 'inquiryId',
  // The request to withdraw a motion already stated, put to the meeting
  WITHDRAW_MOTION: 'motionId',
};

/**
 * The decisions the minutes record, stamped with the server's clock (ISO) as `at`, from which
 * the minutes order them and give their times. Each action's `timestamp` is a clock time
 * without a date (generateTimestamp), which the log shows as it is.
 */
export const CLOCKED_ACTIONS: ReadonlySet<MeetingAction['type']> = new Set<MeetingAction['type']>([
  'CLOSE_VOTING',
  'UNANIMOUS_CONSENT_PASSED',
  'DECLINE_SECOND',
  'WITHDRAW_MOTION',
  'CHAIR_RULING',
  'DECLARE_ELECTED',
  'ELECT_BY_ACCLAMATION',
  'SET_ASIDE_ELECTION',
  'APPROVE_MINUTES',
  'RESUME_MEETING',
  'ADOPT_AGENDA',
]);

/** The fields of an action that say who is acting, which the server sets from the socket */
export interface ActorFields {
  /** Set to the sender's user id */
  id?: string;
  /** Set to the sender's current name */
  name?: string;
  /** Set to the sender as a meeting member */
  member?: true;
}

const NONE: ActorFields = {};

/**
 * Who is acting, for every action type. A client can never act as someone else: each of these
 * fields is overwritten with the signed-in user. Fields that name someone else (the speaker
 * the chair recognizes, a nominee, the member marked absent) are left alone; the permission
 * guard and the validator decide who may name them.
 */
export const ACTOR_FIELDS: Record<MeetingAction['type'], ActorFields> = {
  START_MEETING: NONE,
  END_MEETING: NONE,
  MAKE_MOTION: { id: 'moverId', name: 'mover' },
  // The chair records the motion; the mover it names (moverMemberId, moverName) is someone
  // else, never the sender, and the validator checks them
  MAKE_FLOOR_MOTION: { id: 'recordedBy' },
  SECOND_MOTION: { id: 'seconderId', name: 'seconder' },
  // Likewise the seconder it names (seconderMemberId, seconderName)
  SECOND_FROM_FLOOR: { id: 'recordedBy' },
  DECLINE_SECOND: NONE,
  OPEN_VOTING: NONE,
  CAST_VOTE: { id: 'voterId' },
  CLOSE_VOTING: NONE,
  SET_FLOOR_TALLY: NONE,
  RAISE_HAND: { member: true },
  LOWER_HAND: { member: true },
  RECOGNIZE_SPEAKER: NONE,
  YIELD_FLOOR: { id: 'yieldedBy' },
  ADD_AGENDA_ITEM: NONE,
  REMOVE_AGENDA_ITEM: NONE,
  ADOPT_AGENDA: NONE,
  AGENDA_OBJECTION: { id: 'objectorId' },
  CALL_AGENDA_ITEM: NONE,
  COMPLETE_AGENDA_ITEM: NONE,
  REORDER_AGENDA: NONE,
  RELOAD_AGENDA: NONE,
  SET_MEETING_INFO: NONE,
  SET_BOARD: NONE,
  SET_SPEAKER_TIME_LIMIT: NONE,
  SET_VOTE_TIME_LIMIT: NONE,
  REQUEST_UNANIMOUS_CONSENT: NONE,
  OBJECT_TO_CONSENT: { id: 'objectorId', name: 'objector' },
  UNANIMOUS_CONSENT_PASSED: NONE,
  SET_VOTING_METHOD: NONE,
  ADVANCE_MEETING_STAGE: NONE,
  SET_MEETING_STAGE: NONE,
  SET_QUORUM: NONE,
  APPROVE_MINUTES: NONE,
  SET_PREVIOUS_MINUTES: NONE,
  ADD_COMMITTEE_REPORT: NONE,
  PRESENT_COMMITTEE_REPORT: NONE,
  CHAIR_RULING: NONE,
  OPEN_NOMINATIONS: NONE,
  NOMINATE: { id: 'nominatorId', name: 'nominatedBy' },
  DECLINE_NOMINATION: { id: 'declinedBy' },
  CLOSE_NOMINATIONS: NONE,
  START_ELECTION: NONE,
  CAST_BALLOT: { id: 'voterId' },
  CLOSE_ELECTION: NONE,
  SET_FLOOR_BALLOTS: NONE,
  DECLARE_ELECTED: NONE,
  ELECT_BY_ACCLAMATION: NONE,
  SET_ASIDE_ELECTION: NONE,
  ASK_INQUIRY: { id: 'askerId', name: 'askedBy' },
  ANSWER_INQUIRY: { name: 'answeredBy' },
  SET_MEMBER_ROLE: { id: 'changedById', name: 'changedBy' },
  ADD_MEMBER: NONE,
  SET_MEMBER_PRESENCE: NONE,
  REFRESH_MEMBERS: NONE,
  MARK_PRESENT: NONE,
  SET_HEADCOUNT: NONE,
  WITHDRAW_MOTION: { id: 'requesterId' },
  MODIFY_MOTION: { id: 'requesterId' },
  TAKE_UP_POSTPONED: NONE,
  RESUME_MEETING: NONE,
  REQUEST_DIVISION: { id: 'requesterId' },
  START_ROLL_CALL: NONE,
  RESPOND_ROLL_CALL: { id: 'memberId' },
  COMPLETE_ROLL_CALL: NONE,
  MARK_ABSENT: NONE,
  SET_AUTO_YIELD: NONE,
  // grantedBy names the absent member a chair or admin grants for (see permissionGuard)
};

/**
 * Enrich action with server-authoritative values
 * This prevents clients from spoofing their identity
 */
export function enrichAction(
  action: MeetingAction,
  socketData: SocketData,
  members: readonly Member[] = [],
): MeetingAction {
  const enriched = { ...action } as MeetingAction & Record<string, unknown>;
  // The member's current name and role: the session keeps the name given at sign-in, so a
  // member renamed since would otherwise be stamped with the old one
  const self = members.find((m) => m.id === socketData.userId) ?? {
    id: socketData.userId,
    name: socketData.name,
    role: socketData.role,
    present: true,
  };

  const actor = ACTOR_FIELDS[enriched.type] ?? NONE;
  if (actor.id) enriched[actor.id] = socketData.userId;
  if (actor.name) enriched[actor.name] = self.name;
  if (actor.member) enriched.member = self;

  // The speaker the chair recognizes is the member as the meeting has them, by id: a client's
  // copy may be stale (a name since refreshed, a field since retired)
  if (enriched.type === 'RECOGNIZE_SPEAKER') {
    const speaker = members.find((m) => m.id === (enriched.member as Member | undefined)?.id);
    if (speaker) enriched.member = speaker;
  }

  // The person marked present comes from the organization's roster, never from a client
  if (enriched.type === 'MARK_PRESENT') {
    delete enriched.member;
  }

  // The chair being replaced is found in the state (see the action handler), never named by a
  // client: otherwise any member could be demoted along with the handover
  if (enriched.type === 'SET_MEMBER_ROLE') {
    delete enriched.previousChairId;
  }

  // Server generates timestamps using shared utility for consistency
  if ('timestamp' in enriched) {
    enriched.timestamp = generateTimestamp();
  }

  // When a decision the minutes record happened, by the server's clock, never a client's
  if (CLOCKED_ACTIONS.has(enriched.type)) {
    enriched.at = new Date().toISOString();
  }

  // Server generates the ID of a new item using shared utility to prevent collisions. Actions
  // that refer to an existing item (DECLINE_NOMINATION, ANSWER_INQUIRY) keep the client's ID.
  const createdIdField = CREATED_ID_FIELDS[enriched.type];
  if (createdIdField && createdIdField in enriched) {
    enriched[createdIdField] = generateId();
  }

  return enriched as MeetingAction;
}
