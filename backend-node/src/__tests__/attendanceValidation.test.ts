import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { MAX_HEADCOUNT, validateAction } from '../socket/actionValidator.js';

const ann: Member = { id: 1, name: 'Ann', role: 'member', present: true, presentBy: 'device' };
const state: MeetingState = { ...initialState, members: [ann] };

describe('validating attendance actions', () => {
  describe('MARK_PRESENT', () => {
    const fromRoster: Member = { id: 2, name: 'Bo', role: 'member', present: true };

    it('needs the person the server found in the roster', () => {
      const action: MeetingAction = { type: 'MARK_PRESENT', userId: 2, timestamp: '' };
      expect(validateAction(state, action)).toMatchObject({
        valid: false,
        errorCode: 'NOT_A_MEMBER',
      });
      expect(validateAction(state, { ...action, member: fromRoster }).valid).toBe(true);
    });

    it('refuses a member already marked present', () => {
      const marked = { ...state, members: [{ ...ann, presentBy: 'chair' as const }] };
      const action: MeetingAction = { type: 'MARK_PRESENT', userId: 1, member: ann, timestamp: '' };
      expect(validateAction(marked, action)).toMatchObject({
        valid: false,
        errorCode: 'INVALID_STATE',
      });
      // On a device, a member can still be marked, so they stay present without it
      expect(validateAction(state, action).valid).toBe(true);
    });
  });

  describe('SET_HEADCOUNT', () => {
    const headcount = (count: number, names: unknown = []) =>
      validateAction(state, {
        type: 'SET_HEADCOUNT',
        count,
        names,
        timestamp: '',
      } as MeetingAction);

    it('takes a whole number from 0, and at most one name for each person', () => {
      expect(headcount(0).valid).toBe(true);
      expect(headcount(2, ['Dee', ' ', 'Eli']).valid).toBe(true);
      expect(headcount(MAX_HEADCOUNT).valid).toBe(true);
    });

    it.each([
      [-1, []],
      [1.5, []],
      [MAX_HEADCOUNT + 1, []],
      [1, ['Dee', 'Eli']],
      [1, 'Dee'],
      [1, [7]],
      [1, ['x'.repeat(101)]],
    ])('refuses %s with %j', (count, names) => {
      expect(headcount(count as number, names)).toMatchObject({
        valid: false,
        errorCode: 'INVALID_ACTION',
      });
    });
  });

  describe('RELOAD_AGENDA', () => {
    const reload: MeetingAction = { type: 'RELOAD_AGENDA', agenda: [], timestamp: '' };

    it('is allowed only before the meeting starts', () => {
      expect(validateAction(state, reload).valid).toBe(true);
      expect(validateAction({ ...state, meetingActive: true }, reload)).toMatchObject({
        valid: false,
        errorCode: 'MEETING_ALREADY_ACTIVE',
      });
      const adjourned = { ...state, meetingStage: 'adjourned' as const };
      expect(validateAction(adjourned, reload).valid).toBe(false);
    });
  });
});
