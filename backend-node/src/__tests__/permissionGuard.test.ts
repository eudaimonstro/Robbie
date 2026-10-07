import { describe, it, expect } from 'vitest';
import {
  checkPermission,
  getPermittedActions,
  getPermissionDeniedReason,
} from '../socket/permissionGuard.js';

describe('permissionGuard', () => {
  describe('checkPermission', () => {
    describe('chair-only actions', () => {
      const chairOnlyActions = [
        'START_MEETING',
        'END_MEETING',
        'OPEN_VOTING',
        'CLOSE_VOTING',
        'RECOGNIZE_SPEAKER',
        'CHAIR_RULING',
        'ADOPT_AGENDA',
        'CALL_AGENDA_ITEM',
        'COMPLETE_AGENDA_ITEM',
        'REQUEST_UNANIMOUS_CONSENT',
        'UNANIMOUS_CONSENT_PASSED',
        'ADVANCE_MEETING_STAGE',
        'APPROVE_MINUTES',
        'OPEN_NOMINATIONS',
        'CLOSE_NOMINATIONS',
        'START_ELECTION',
        'CLOSE_ELECTION',
        'DECLARE_ELECTED',
        'SUSPEND_RULE_APPROVED',
        'RESTORE_RULE',
        'ANSWER_INQUIRY',
        'PRESENT_COMMITTEE_REPORT',
        'START_ROLL_CALL',
        'COMPLETE_ROLL_CALL',
        'MARK_ABSENT',
        'SET_AUTO_YIELD',
        'MARK_PRESENT',
        'SET_HEADCOUNT',
      ] as const;

      it.each(chairOnlyActions)('should allow chair to perform %s', (action) => {
        expect(checkPermission('chair', action)).toBe(true);
      });

      it.each(chairOnlyActions)('should allow admin to perform %s', (action) => {
        expect(checkPermission('admin', action)).toBe(true);
      });

      it.each(chairOnlyActions)('should deny member from performing %s', (action) => {
        expect(checkPermission('member', action)).toBe(false);
      });

      it.each(chairOnlyActions)('should deny guest from performing %s', (action) => {
        expect(checkPermission('guest', action)).toBe(false);
      });
    });

    describe('admin-only actions', () => {
      const adminOnlyActions = [
        'SET_SPEAKER_TIME_LIMIT',
        'SET_VOTE_TIME_LIMIT',
        'SET_PREVIOUS_MINUTES',
      ] as const;

      it.each(adminOnlyActions)('should allow admin to perform %s', (action) => {
        expect(checkPermission('admin', action)).toBe(true);
      });

      it.each(adminOnlyActions)('should deny chair from performing %s', (action) => {
        expect(checkPermission('chair', action)).toBe(false);
      });

      it.each(adminOnlyActions)('should deny member from performing %s', (action) => {
        expect(checkPermission('member', action)).toBe(false);
      });
    });

    describe('admin or chair actions', () => {
      const adminOrChairActions = [
        'ADD_AGENDA_ITEM',
        'REMOVE_AGENDA_ITEM',
        'REORDER_AGENDA',
        'ADD_COMMITTEE_REPORT',
        'SET_VOTING_METHOD',
        'SET_MEMBER_ROLE',
      ] as const;

      it.each(adminOrChairActions)('should allow admin to perform %s', (action) => {
        expect(checkPermission('admin', action)).toBe(true);
      });

      it.each(adminOrChairActions)('should allow chair to perform %s', (action) => {
        expect(checkPermission('chair', action)).toBe(true);
      });

      it.each(adminOrChairActions)('should deny member from performing %s', (action) => {
        expect(checkPermission('member', action)).toBe(false);
      });
    });

    describe('server-only actions', () => {
      const serverOnlyActions = [
        'ADD_MEMBER',
        'SET_MEMBER_PRESENCE',
        'REFRESH_MEMBERS',
        'RELOAD_AGENDA',
      ] as const;

      it.each(serverOnlyActions)('should deny every role %s', (action) => {
        for (const role of ['admin', 'chair', 'member', 'guest'] as const) {
          expect(checkPermission(role, action), role).toBe(false);
        }
      });
    });

    describe('member actions (members, the chair and admins, not guests)', () => {
      const memberActions = [
        'MAKE_MOTION',
        'SECOND_MOTION',
        'DECLINE_SECOND',
        'CAST_VOTE',
        'OBJECT_TO_CONSENT',
        'AGENDA_OBJECTION',
        'NOMINATE',
        'DECLINE_NOMINATION',
        'CAST_BALLOT',
        'WITHDRAW_MOTION',
        'MODIFY_MOTION',
        'RESPOND_ROLL_CALL',
        'CAST_PROXY_VOTE',
        'REQUEST_PROXY',
        'ACCEPT_PROXY',
        'DECLINE_PROXY',
        'CANCEL_PROXY_REQUEST',
      ] as const;

      it.each(memberActions)('should deny guest from performing %s', (action) => {
        expect(checkPermission('guest', action)).toBe(false);
      });

      it.each(memberActions)('should allow member to perform %s', (action) => {
        expect(checkPermission('member', action)).toBe(true);
      });

      it.each(memberActions)('should allow chair to perform %s', (action) => {
        expect(checkPermission('chair', action)).toBe(true);
      });

      it.each(memberActions)('should allow admin to perform %s', (action) => {
        expect(checkPermission('admin', action)).toBe(true);
      });
    });

    describe('actions guests may take', () => {
      const guestActions = [
        'RAISE_HAND',
        'LOWER_HAND',
        'YIELD_FLOOR',
        'ASK_INQUIRY',
        'RENAME_MEMBER',
      ] as const;

      it.each(guestActions)('should allow every role to perform %s', (action) => {
        for (const role of ['admin', 'chair', 'member', 'guest'] as const) {
          expect(checkPermission(role, action), role).toBe(true);
        }
      });
    });

    it('should return false for unknown action types', () => {
      // @ts-expect-error - Testing invalid action type
      expect(checkPermission('admin', 'INVALID_ACTION')).toBe(false);
    });
  });

  describe('getPermittedActions', () => {
    it('should return all member-level actions for member role', () => {
      const permitted = getPermittedActions('member');

      expect(permitted).toContain('MAKE_MOTION');
      expect(permitted).toContain('CAST_VOTE');
      expect(permitted).toContain('RAISE_HAND');
      expect(permitted).not.toContain('START_MEETING');
      expect(permitted).not.toContain('SET_SPEAKER_TIME_LIMIT');
    });

    it('should return member + chair actions for chair role', () => {
      const permitted = getPermittedActions('chair');

      // Chair actions
      expect(permitted).toContain('START_MEETING');
      expect(permitted).toContain('END_MEETING');
      expect(permitted).toContain('RECOGNIZE_SPEAKER');

      // Member actions
      expect(permitted).toContain('MAKE_MOTION');
      expect(permitted).toContain('CAST_VOTE');

      // Not admin-only
      expect(permitted).not.toContain('SET_SPEAKER_TIME_LIMIT');
    });

    it('should return all actions for admin role', () => {
      const permitted = getPermittedActions('admin');

      // Admin actions
      expect(permitted).toContain('SET_SPEAKER_TIME_LIMIT');
      // Server-only actions are nobody's
      expect(permitted).not.toContain('ADD_MEMBER');

      // Chair actions
      expect(permitted).toContain('START_MEETING');

      // Member actions
      expect(permitted).toContain('MAKE_MOTION');
    });

    it('should give guests only following, asking to speak and asking questions', () => {
      expect(getPermittedActions('guest').sort()).toEqual(
        ['ASK_INQUIRY', 'LOWER_HAND', 'RAISE_HAND', 'RENAME_MEMBER', 'YIELD_FLOOR'].sort(),
      );
    });

    it('should return more actions for higher privilege levels', () => {
      const memberActions = getPermittedActions('member');
      const chairActions = getPermittedActions('chair');
      const adminActions = getPermittedActions('admin');

      expect(chairActions.length).toBeGreaterThan(memberActions.length);
      expect(adminActions.length).toBeGreaterThan(chairActions.length);
    });
  });

  describe('getPermissionDeniedReason', () => {
    it('should return admin message for admin-only actions', () => {
      const reason = getPermissionDeniedReason('SET_SPEAKER_TIME_LIMIT');
      expect(reason).toBe('This action requires admin privileges');
    });

    it('should return chair message for chair-only actions', () => {
      const reason = getPermissionDeniedReason('START_MEETING');
      expect(reason).toBe('This action can only be performed by the chair');
    });

    it('should tell a guest what they cannot take part in', () => {
      const reason = getPermissionDeniedReason('MAKE_MOTION');
      expect(reason).toBe('Guests can follow the meeting but not take part in this');
    });

    it('should name server-only actions', () => {
      expect(getPermissionDeniedReason('ADD_MEMBER')).toBe('Only the server applies this action');
    });

    it('should return generic message for other actions', () => {
      const reason = getPermissionDeniedReason('RAISE_HAND');
      expect(reason).toBe('You do not have permission to perform this action');
    });

    it('should return unknown message for invalid actions', () => {
      // @ts-expect-error - Testing invalid action type
      const reason = getPermissionDeniedReason('INVALID_ACTION');
      expect(reason).toBe('Unknown action type');
    });
  });
});
