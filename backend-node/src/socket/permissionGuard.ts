import type { MeetingAction, MeetingRole } from '@robbie-bylawyer/shared/types';
import { logger } from '../middleware/logger.js';

type Role = MeetingRole;

/** Who presides: the chair, and admins (secretaries and above), who can do what a chair does */
const PRESIDING: Role[] = ['chair', 'admin'];
/** Everyone who takes part: members vote, move and second; the chair and admins too */
const TAKING_PART: Role[] = ['member', 'chair', 'admin'];
/**
 * Guests and observers as well: following, asking to speak and asking questions. Observers (in
 * a board meeting, the organization's people who aren't directors) are in no other list: they
 * never move, second, vote or nominate, and the chair decides whom to recognize.
 */
const EVERYONE: Role[] = ['guest', 'observer', 'member', 'chair', 'admin'];
/** Actions only the server applies (on join, disconnect and from REST routes) */
const SERVER_ONLY: Role[] = [];

/**
 * Permission matrix for all action types: the meeting roles that may send each one. Meeting
 * roles come from the organization (see deriveMeetingRole); guests never vote, move, second,
 * answer roll call, hold or grant proxies, or are nominated.
 */
const PERMISSIONS: Record<MeetingAction['type'], Role[]> = {
  // Chair-only actions
  START_MEETING: PRESIDING,
  END_MEETING: PRESIDING,
  OPEN_VOTING: PRESIDING,
  CLOSE_VOTING: PRESIDING,
  SET_FLOOR_TALLY: PRESIDING,
  RECOGNIZE_SPEAKER: PRESIDING,
  CHAIR_RULING: PRESIDING,
  ADOPT_AGENDA: PRESIDING,
  CALL_AGENDA_ITEM: PRESIDING,
  COMPLETE_AGENDA_ITEM: PRESIDING,
  REQUEST_UNANIMOUS_CONSENT: PRESIDING,
  UNANIMOUS_CONSENT_PASSED: PRESIDING,
  // The chair or secretary, when a bylaw sets a different quorum for this meeting
  SET_QUORUM: PRESIDING,
  APPROVE_MINUTES: PRESIDING,
  OPEN_NOMINATIONS: PRESIDING,
  CLOSE_NOMINATIONS: PRESIDING,
  START_ELECTION: PRESIDING,
  CLOSE_ELECTION: PRESIDING,
  SET_FLOOR_BALLOTS: PRESIDING,
  DECLARE_ELECTED: PRESIDING,
  ELECT_BY_ACCLAMATION: PRESIDING,
  SET_ASIDE_ELECTION: PRESIDING,
  // The chair takes up a question postponed to later in the meeting, and ends a recess
  TAKE_UP_POSTPONED: PRESIDING,
  RESUME_MEETING: PRESIDING,
  ANSWER_INQUIRY: PRESIDING,
  MARK_ABSENT: PRESIDING,
  SET_AUTO_YIELD: PRESIDING,

  // Attendance: the chair or secretary marks people present and counts the room
  MARK_PRESENT: PRESIDING,
  SET_HEADCOUNT: PRESIDING,

  // Business from the floor: the chair or secretary records what people in the room do
  // (a nomination from the floor is NOMINATE with fromFloor, which the validator checks)
  MAKE_FLOOR_MOTION: PRESIDING,
  SECOND_FROM_FLOOR: PRESIDING,

  // Admin-only actions
  SET_SPEAKER_TIME_LIMIT: ['admin'],
  SET_VOTE_TIME_LIMIT: ['admin'],
  ADD_AGENDA_ITEM: PRESIDING,
  REMOVE_AGENDA_ITEM: PRESIDING,
  REORDER_AGENDA: PRESIDING,
  SET_VOTING_METHOD: PRESIDING,

  // Role management: only the chair can be handed over (see roleChangeHandler); the
  // organization decides every other role
  SET_MEMBER_ROLE: PRESIDING,

  // Server-only actions
  ADD_MEMBER: SERVER_ONLY,
  SET_MEMBER_PRESENCE: SERVER_ONLY,
  REFRESH_MEMBERS: SERVER_ONLY,
  RELOAD_AGENDA: SERVER_ONLY,
  SET_MEETING_INFO: SERVER_ONLY,
  SET_BOARD: SERVER_ONLY,
  // The server loads the previous meeting's published minutes (see joinHandler)
  SET_PREVIOUS_MINUTES: SERVER_ONLY,

  // Member actions
  MAKE_MOTION: TAKING_PART,
  SECOND_MOTION: TAKING_PART,
  DECLINE_SECOND: PRESIDING, // The chair declares a motion dead for want of a second
  CAST_VOTE: TAKING_PART,
  OBJECT_TO_CONSENT: TAKING_PART,
  AGENDA_OBJECTION: TAKING_PART,
  NOMINATE: TAKING_PART,
  DECLINE_NOMINATION: TAKING_PART,
  CAST_BALLOT: TAKING_PART,
  WITHDRAW_MOTION: TAKING_PART,
  // A member doubts a voice vote (the chair records one from the floor, which the validator checks)
  REQUEST_DIVISION: TAKING_PART,

  // Actions guests may take too: asking for the floor, and asking a question
  RAISE_HAND: EVERYONE,
  LOWER_HAND: EVERYONE,
  YIELD_FLOOR: EVERYONE,
  ASK_INQUIRY: EVERYONE,
};

/**
 * Check if a role has permission to perform an action
 * @param role - The user's role
 * @param actionType - The action type being attempted
 * @returns true if the role can perform the action
 */
export function checkPermission(role: Role, actionType: MeetingAction['type']): boolean {
  const allowedRoles = PERMISSIONS[actionType];

  if (!allowedRoles) {
    logger.warn({ actionType }, 'Unknown action type');
    return false;
  }

  return allowedRoles.includes(role);
}

/**
 * Whether members may send this action: taking part (moving, seconding, voting, asking for the
 * floor), as opposed to presiding. A presiding officer without a vote (in a board meeting, one
 * who isn't a director) may send only the others; the validator refuses these from them.
 */
export function membersMaySend(actionType: MeetingAction['type']): boolean {
  return PERMISSIONS[actionType]?.includes('member') ?? false;
}

/** Whether only the server applies this action (on join, disconnect and from REST routes) */
export function isServerOnly(actionType: MeetingAction['type']): boolean {
  return PERMISSIONS[actionType]?.length === 0;
}

/** Every action type, for tests that walk the action union */
export const ACTION_TYPES = Object.keys(PERMISSIONS) as MeetingAction['type'][];

/**
 * Get all actions a role is permitted to perform
 * @param role - The user's role
 * @returns Array of action types the role can perform
 */
export function getPermittedActions(role: Role): MeetingAction['type'][] {
  return ACTION_TYPES.filter((actionType) => PERMISSIONS[actionType].includes(role));
}

/**
 * Get a human-readable description of why an action was denied
 * @param actionType - The action that was attempted
 * @returns Description of the permission requirement
 */
export function getPermissionDeniedReason(actionType: MeetingAction['type']): string {
  const allowedRoles = PERMISSIONS[actionType];

  if (!allowedRoles) {
    return 'Unknown action type';
  }

  if (allowedRoles.length === 0) {
    return 'Only the server applies this action';
  }

  if (allowedRoles.includes('admin') && !allowedRoles.includes('chair')) {
    return 'This action requires admin privileges';
  }

  if (allowedRoles.includes('chair') && !allowedRoles.includes('member')) {
    return 'This action can only be performed by the chair';
  }

  if (!allowedRoles.includes('guest')) {
    return 'Guests can follow the meeting but not take part in this';
  }

  return 'You do not have permission to perform this action';
}
