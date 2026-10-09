import { describe, it, expect } from 'vitest';
import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MEETING_CODE_PATTERN,
} from '../../constants/index.js';
import { ORG_ROLES, atLeast, canEditAmendment, normalizeEmail } from '../../utils/index.js';

// The rules the server and the web both apply, from one place
describe('rules both sides share', () => {
  it('ranks the organization roles from viewer to owner', () => {
    expect(ORG_ROLES).toEqual(['viewer', 'member', 'secretary', 'admin', 'owner']);
    expect(atLeast('owner', 'admin')).toBe(true);
    expect(atLeast('member', 'secretary')).toBe(false);
  });

  it('lets a member edit only their own drafts, and a secretary any amendment', () => {
    const own = { status: 'draft', createdById: 7 };
    expect(canEditAmendment('member', 7, own)).toBe(true);
    expect(canEditAmendment('member', 8, own)).toBe(false);
    expect(canEditAmendment('member', 7, { ...own, status: 'proposed' })).toBe(false);
    expect(canEditAmendment('secretary', 8, { ...own, status: 'proposed' })).toBe(true);
    expect(canEditAmendment('viewer', 7, own)).toBe(false);
  });

  it('takes meeting codes of 4 to 8 upper-case letters or digits', () => {
    expect(MEETING_CODE_PATTERN.test('MAPLE1')).toBe(true);
    expect(MEETING_CODE_PATTERN.test('AB1')).toBe(false);
    expect(MEETING_CODE_PATTERN.test('maple1')).toBe(false);
    expect(MEETING_CODE_PATTERN.test('TOOLONG99')).toBe(false);
  });

  it('takes PDF, Word, text and RTF attachments up to 10 MB', () => {
    expect(Object.keys(ATTACHMENT_TYPES)).toContain('application/pdf');
    expect(ATTACHMENT_TYPES['text/rtf']).toEqual({ label: 'RTF', extension: '.rtf' });
    expect(MAX_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024);
  });

  it('compares emails trimmed and lowercased', () => {
    expect(normalizeEmail('  Ann@Example.ORG ')).toBe('ann@example.org');
  });
});
