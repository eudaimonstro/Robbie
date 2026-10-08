import { describe, it, expect, vi } from 'vitest';
import type { Member } from '@robbie-bylawyer/shared/types';
import type { OrgRole } from '../generated/prisma/client.js';

// A stubbed roster: user 1 is an owner, 2 a secretary, 3 a member (renamed since), 4 a viewer
const roster = new Map<number, { role: OrgRole; name: string | null; email: string }>([
  [1, { role: 'owner', name: 'Olive', email: 'olive@example.org' }],
  [2, { role: 'secretary', name: 'Pat', email: 'pat@example.org' }],
  [3, { role: 'member', name: 'Dana Smith', email: 'dana@example.org' }],
  [4, { role: 'viewer', name: 'Vic', email: 'vic@example.org' }],
]);
vi.mock('../socket/meetingPacket.js', () => ({
  findOrgPeople: async (_org: string, ids: number[]) =>
    new Map([...roster].filter(([id]) => ids.includes(id))),
  findMeetingPacket: async () => null,
}));

const { deriveMeetingRole, roleChanges } = await import('../socket/meetingRoles.js');

describe('deriveMeetingRole', () => {
  it.each([
    ['owner', 'admin'],
    ['admin', 'admin'],
    ['secretary', 'admin'],
    ['member', 'member'],
    ['viewer', 'guest'],
    [null, 'guest'],
  ] as const)('gives an organization %s the meeting role %s', (orgRole, meetingRole) => {
    expect(deriveMeetingRole(null, orgRole, 7)).toBe(meetingRole);
  });

  it("makes the packet's presiding officer the chair, whatever their organization role", () => {
    for (const orgRole of ['member', 'secretary', 'owner'] as const) {
      expect(deriveMeetingRole(7, orgRole, 7)).toBe('chair');
    }
    // Someone else presides
    expect(deriveMeetingRole(8, 'owner', 7)).toBe('admin');
  });

  it("doesn't let a presiding officer who is no longer a voting member chair", () => {
    expect(deriveMeetingRole(7, 'viewer', 7)).toBe('guest');
    expect(deriveMeetingRole(7, null, 7)).toBe('guest');
  });
});

describe('roleChanges', () => {
  const member = (id: number, name: string, role: Member['role']): Member => ({
    id,
    name,
    role,
    present: true,
  });

  it('lists the members whose role the organization now has otherwise, with their names as the meeting has them', async () => {
    const changes = await roleChanges({ organizationId: 'org', chairUserId: 2 }, [
      member(1, 'Olive', 'admin'), // unchanged
      member(2, 'Pat', 'admin'), // now presides
      member(3, 'Dana', 'chair'), // no longer presides
      member(4, 'Vic', 'member'), // a viewer is a guest
      member(9, 'Walk-in', 'guest'), // not in the organization: unchanged
    ]);
    expect(changes).toEqual([
      { id: 2, name: 'Pat', role: 'chair' },
      { id: 3, name: 'Dana', role: 'member' },
      { id: 4, name: 'Vic', role: 'guest' },
    ]);
  });
});
