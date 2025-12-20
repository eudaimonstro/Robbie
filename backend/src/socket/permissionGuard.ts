import type { MeetingAction } from '@robbie/shared/types';

type Role = 'member' | 'chair' | 'admin';

/**
 * Permission matrix for all action types
 * Maps action types to the minimum role required to perform them
 */
const PERMISSIONS: Record<MeetingAction['type'], Role[]> = {
  // Chair-only actions
  START_MEETING: ['chair', 'admin'],
  END_MEETING: ['chair', 'admin'],
  OPEN_VOTING: ['chair', 'admin'],
  CLOSE_VOTING: ['chair', 'admin'],
  RECOGNIZE_SPEAKER: ['chair', 'admin'],
  CHAIR_RULING: ['chair', 'admin'],
  ADOPT_AGENDA: ['chair', 'admin'],
  CALL_AGENDA_ITEM: ['chair', 'admin'],
  COMPLETE_AGENDA_ITEM: ['chair', 'admin'],
  REQUEST_UNANIMOUS_CONSENT: ['chair', 'admin'],
  UNANIMOUS_CONSENT_PASSED: ['chair', 'admin'],
  ADVANCE_MEETING_STAGE: ['chair', 'admin'],
  APPROVE_MINUTES: ['chair', 'admin'],
  OPEN_NOMINATIONS: ['chair', 'admin'],
  CLOSE_NOMINATIONS: ['chair', 'admin'],
  START_ELECTION: ['chair', 'admin'],
  CLOSE_ELECTION: ['chair', 'admin'],
  DECLARE_ELECTED: ['chair', 'admin'],
  SUSPEND_RULE_APPROVED: ['chair', 'admin'],
  RESTORE_RULE: ['chair', 'admin'],
  ANSWER_INQUIRY: ['chair', 'admin'],
  PRESENT_COMMITTEE_REPORT: ['chair', 'admin'],

  // Admin-only actions
  SET_SPEAKER_TIME_LIMIT: ['admin'],
  SET_VOTE_TIME_LIMIT: ['admin'],
  ADD_AGENDA_ITEM: ['admin', 'chair'],
  REMOVE_AGENDA_ITEM: ['admin', 'chair'],
  REORDER_AGENDA: ['admin', 'chair'],
  SET_PREVIOUS_MINUTES: ['admin'],
  ADD_COMMITTEE_REPORT: ['admin', 'chair'],
  SET_VOTING_METHOD: ['admin', 'chair'],

  // Role management (admin can assign any role, chair can only transfer chair role)
  SET_MEMBER_ROLE: ['admin', 'chair'],

  // Member actions (all roles can perform)
  MAKE_MOTION: ['member', 'chair', 'admin'],
  SECOND_MOTION: ['member', 'chair', 'admin'],
  DECLINE_SECOND: ['member', 'chair', 'admin'],
  CAST_VOTE: ['member', 'chair', 'admin'],
  RAISE_HAND: ['member', 'chair', 'admin'],
  LOWER_HAND: ['member', 'chair', 'admin'],
  YIELD_FLOOR: ['member', 'chair', 'admin'],
  OBJECT_TO_CONSENT: ['member', 'chair', 'admin'],
  AGENDA_OBJECTION: ['member', 'chair', 'admin'],
  NOMINATE: ['member', 'chair', 'admin'],
  DECLINE_NOMINATION: ['member', 'chair', 'admin'],
  CAST_BALLOT: ['member', 'chair', 'admin'],
  ASK_INQUIRY: ['member', 'chair', 'admin'],
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
    console.warn(`Unknown action type: ${actionType}`);
    return false;
  }

  return allowedRoles.includes(role);
}

/**
 * Get all actions a role is permitted to perform
 * @param role - The user's role
 * @returns Array of action types the role can perform
 */
export function getPermittedActions(role: Role): MeetingAction['type'][] {
  return Object.entries(PERMISSIONS)
    .filter(([, roles]) => roles.includes(role))
    .map(([actionType]) => actionType as MeetingAction['type']);
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

  if (allowedRoles.includes('admin') && !allowedRoles.includes('chair')) {
    return 'This action requires admin privileges';
  }

  if (allowedRoles.includes('chair') && !allowedRoles.includes('member')) {
    return 'This action can only be performed by the chair';
  }

  return 'You do not have permission to perform this action';
}
