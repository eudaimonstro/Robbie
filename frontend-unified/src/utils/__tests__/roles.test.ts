import { describe, it, expect } from 'vitest';
import { assignableRoles, atLeast, canEditAmendment } from '../roles';

describe('roles', () => {
  it('ranks roles as the server does', () => {
    expect(atLeast('secretary', 'member')).toBe(true);
    expect(atLeast('member', 'secretary')).toBe(false);
    expect(atLeast('owner', 'owner')).toBe(true);
    expect(atLeast('viewer', 'viewer')).toBe(true);
  });

  it('lets an admin give roles up to admin, and only an owner give owner', () => {
    expect(assignableRoles('admin')).toEqual(['viewer', 'member', 'secretary', 'admin']);
    expect(assignableRoles('owner')).toEqual(['viewer', 'member', 'secretary', 'admin', 'owner']);
    expect(assignableRoles('secretary')).toEqual([]);
  });

  it('lets a member edit only their own draft, and a secretary any amendment', () => {
    const draft = { status: 'draft', createdById: 7 };
    expect(canEditAmendment('member', 7, draft)).toBe(true);
    expect(canEditAmendment('member', 8, draft)).toBe(false);
    expect(canEditAmendment('member', 7, { ...draft, status: 'proposed' })).toBe(false);
    expect(canEditAmendment('viewer', 7, draft)).toBe(false);
    expect(canEditAmendment('secretary', 8, draft)).toBe(true);
  });
});
