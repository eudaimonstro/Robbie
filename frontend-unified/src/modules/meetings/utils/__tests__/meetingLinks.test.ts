import { describe, it, expect } from 'vitest';
import { MEETING_CODE_PATTERN } from '@robbie-bylawyer/shared/constants';
import { joinUrl, meetingPath, normalizeMeetingCode } from '../meetingLinks';

describe('meeting links', () => {
  it('know a meeting code as the server does', () => {
    expect(MEETING_CODE_PATTERN.test('MAPLE1')).toBe(true);
    expect(MEETING_CODE_PATTERN.test('AB1')).toBe(false);
    expect(MEETING_CODE_PATTERN.test('NOT-A-CODE')).toBe(false);
  });

  it('take a code as typed or linked', () => {
    expect(normalizeMeetingCode(' maple1 ')).toBe('MAPLE1');
    expect(meetingPath(' maple1 ')).toBe('/meetings/MAPLE1');
  });

  it("join from the app's own address", () => {
    expect(joinUrl('maple1')).toBe(`${window.location.origin}/meetings/MAPLE1`);
  });
});
