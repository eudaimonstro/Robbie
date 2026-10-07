import { describe, it, expect } from 'vitest';
import {
  ROLES,
  atLeast,
  canEditAmendment,
  isOrgRole,
  roleBelow,
  roleNeeded,
} from '../orgs/roles.js';

describe('roles', () => {
  it('ranks roles from viewer to owner', () => {
    expect(ROLES).toEqual(['viewer', 'member', 'secretary', 'admin', 'owner']);
    expect(atLeast('owner', 'admin')).toBe(true);
    expect(atLeast('secretary', 'secretary')).toBe(true);
    expect(atLeast('member', 'secretary')).toBe(false);
    expect(atLeast('viewer', 'member')).toBe(false);
  });

  it('names the role just below', () => {
    expect(roleBelow('member')).toBe('viewer');
    expect(roleBelow('owner')).toBe('admin');
    expect(roleBelow('viewer')).toBeNull();
  });

  it('recognizes role names', () => {
    expect(isOrgRole('admin')).toBe(true);
    expect(isOrgRole('chair')).toBe(false);
    expect(isOrgRole(undefined)).toBe(false);
  });

  it('words the message for a role that is too low', () => {
    expect(roleNeeded('secretary')).toBe('You need the secretary role for this');
  });

  it('lets a member edit only their own drafts, and a secretary any amendment', () => {
    const own = { status: 'draft', createdById: 7 };
    expect(canEditAmendment('member', 7, own)).toBe(true);
    expect(canEditAmendment('member', 8, own)).toBe(false);
    expect(canEditAmendment('member', 7, { ...own, status: 'proposed' })).toBe(false);
    expect(canEditAmendment('member', 7, { ...own, createdById: null })).toBe(false);
    expect(canEditAmendment('viewer', 7, own)).toBe(false);
    expect(canEditAmendment('secretary', 8, { status: 'proposed', createdById: null })).toBe(true);
  });
});
