import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MAX_CORRECTIONS_LENGTH, validateAction } from '../socket/actionValidator.js';
import { checkPermission } from '../socket/permissionGuard.js';

describe('approving the minutes', () => {
  const active = { ...initialState, meetingActive: true };

  it('takes corrections up to 2,000 characters', () => {
    const approve = (corrections: unknown) =>
      validateAction(active, {
        type: 'APPROVE_MINUTES',
        corrections: corrections as string,
        timestamp: '',
      });
    expect(MAX_CORRECTIONS_LENGTH).toBe(2000);
    expect(approve(undefined)).toEqual({ valid: true });
    expect(approve('x'.repeat(2000))).toEqual({ valid: true });
    expect(approve('x'.repeat(2001))).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
    expect(approve(42)).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
  });

  it('is done once', () => {
    expect(
      validateAction(
        { ...active, minutesApproved: true },
        { type: 'APPROVE_MINUTES', timestamp: '' },
      ),
    ).toMatchObject({ valid: false, errorCode: 'MINUTES_ALREADY_APPROVED' });
  });

  it("is for the chair and admins, and the previous minutes are only the server's to set", () => {
    expect(checkPermission('chair', 'APPROVE_MINUTES')).toBe(true);
    expect(checkPermission('admin', 'APPROVE_MINUTES')).toBe(true);
    expect(checkPermission('member', 'APPROVE_MINUTES')).toBe(false);
    for (const role of ['admin', 'chair', 'member', 'guest'] as const) {
      expect(checkPermission(role, 'SET_PREVIOUS_MINUTES'), role).toBe(false);
    }
  });
});
