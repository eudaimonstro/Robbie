import { describe, it, expect } from 'vitest';
import { showsOneOrganizationsRecord } from '../organizationPages';

describe('showsOneOrganizationsRecord', () => {
  it("is true for a document's or an amendment's page", () => {
    expect(showsOneOrganizationsRecord('/documents/123')).toBe(true);
    expect(showsOneOrganizationsRecord('/documents/123/diff')).toBe(true);
    expect(showsOneOrganizationsRecord('/amendments/456')).toBe(true);
  });

  it('is false for lists, settings and live meetings, which follow the selection', () => {
    expect(showsOneOrganizationsRecord('/')).toBe(false);
    expect(showsOneOrganizationsRecord('/amendments')).toBe(false);
    expect(showsOneOrganizationsRecord('/settings')).toBe(false);
    expect(showsOneOrganizationsRecord('/meetings/ABC123')).toBe(false);
  });
});
