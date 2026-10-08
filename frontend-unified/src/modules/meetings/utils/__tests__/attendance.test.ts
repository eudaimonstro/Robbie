import { describe, it, expect } from 'vitest';
import type { AttendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { Member } from '@robbie-bylawyer/shared/types';
import type { MeetingRoster } from '../../../../api/client';
import {
  attendanceChip,
  countedInRoom,
  countedTwice,
  eligibleCount,
  inviteRows,
  quorumLine,
  rosterRows,
  takenOutOfRoom,
} from '../attendance';

const roster: MeetingRoster = {
  members: [
    { userId: 2, name: 'Dana Okafor', email: 'dana@maplegrove.example', orgRole: 'admin' },
    { userId: 3, name: 'Alice Brennan', email: 'alice@maplegrove.example', orgRole: 'member' },
    { userId: 4, name: 'Ben Whitaker', email: 'ben@maplegrove.example', orgRole: 'member' },
    { userId: 5, name: null, email: 'carmen@maplegrove.example', orgRole: 'member' },
    { userId: 9, name: 'Morgan Lee', email: 'morgan@maplegrove.example', orgRole: 'viewer' },
  ],
  invites: [
    { id: 'i1', name: 'Rosa Alvarez', email: 'rosa@maplegrove.example', role: 'member' },
    { id: 'i2', name: null, email: 'new@maplegrove.example', role: 'member' },
  ],
};

const members: Member[] = [
  { id: 2, name: 'Dana Okafor', role: 'chair', present: true, presentBy: 'device' },
  { id: 3, name: 'Alice Brennan', role: 'member', present: true, presentBy: 'chair' },
  { id: 4, name: 'Ben Whitaker', role: 'member', present: false },
];

const summary = (overrides: Partial<AttendanceSummary> = {}): AttendanceSummary => ({
  devicePresent: 1,
  markedPresent: 1,
  headcount: 3,
  proxies: 0,
  proxiesHeld: 0,
  present: 5,
  quorum: 29,
  hasQuorum: false,
  guests: 0,
  ...overrides,
});

describe('rosterRows', () => {
  it("gives each voting member's standing, by name, and leaves viewers out", () => {
    expect(rosterRows(roster, members)).toEqual([
      { userId: 3, name: 'Alice Brennan', status: 'marked' },
      { userId: 4, name: 'Ben Whitaker', status: 'absent' },
      { userId: 5, name: 'carmen', status: 'not-joined' },
      { userId: 2, name: 'Dana Okafor', status: 'connected' },
    ]);
  });

  it('names a member with no name as "A member" when the roster has no email (not an admin)', () => {
    const forMembers: MeetingRoster = {
      members: [{ userId: 6, name: null, orgRole: 'member' }],
      invites: [],
    };
    expect(rosterRows(forMembers, [])).toEqual([
      { userId: 6, name: 'A member', status: 'not-joined' },
    ]);
  });

  it('counts a present member saved without a reason as on a device', () => {
    const rows = rosterRows(roster, [{ id: 2, name: 'Dana Okafor', role: 'chair', present: true }]);
    expect(rows.find((r) => r.userId === 2)?.status).toBe('connected');
  });
});

describe('people added by email who have not signed in', () => {
  it('are listed by name (or, for an admin, email), counted by their addition', () => {
    expect(inviteRows(roster, ['i1'])).toEqual([
      {
        inviteId: 'i2',
        name: null,
        label: 'new@maplegrove.example',
        status: 'waiting',
      },
      { inviteId: 'i1', name: 'Rosa Alvarez', label: 'Rosa Alvarez', status: 'counted' },
    ]);
  });

  it('without a name, are counted unnamed: an email never goes into the names', () => {
    expect(
      countedInRoom(
        { headcount: 1, headcountNames: ['Dee'], headcountInvites: [] },
        { inviteId: 'i2', name: null },
      ),
    ).toEqual({ count: 2, names: ['Dee'], invites: ['i2'] });
  });

  it('are counted in the room by their addition and name, and taken out again', () => {
    const counted = countedInRoom(
      { headcount: 3, headcountNames: ['Dee'], headcountInvites: [] },
      { inviteId: 'i1', name: 'Rosa Alvarez' },
    );
    expect(counted).toEqual({ count: 4, names: ['Dee', 'Rosa Alvarez'], invites: ['i1'] });
    // Already counted (another screen did it): nothing to do
    expect(
      countedInRoom(
        { headcount: 4, headcountNames: [], headcountInvites: ['i1'] },
        { inviteId: 'i1', name: 'Rosa Alvarez' },
      ),
    ).toBeNull();
    expect(
      takenOutOfRoom(
        { headcount: 4, headcountNames: ['Dee', 'Rosa Alvarez'], headcountInvites: ['i1'] },
        { inviteId: 'i1', name: 'Rosa Alvarez' },
      ),
    ).toEqual({ count: 3, names: ['Dee'], invites: [] });
    // Never fewer than the names left
    expect(takenOutOfRoom({ headcount: 1, headcountNames: ['A', 'B'] }, { name: 'A' })).toEqual({
      count: 1,
      names: ['B'],
      invites: [],
    });
  });

  it('are found counted twice once they are here as members, by addition or by name', () => {
    const withJoin: MeetingRoster = {
      ...roster,
      members: [
        ...roster.members,
        { userId: 7, name: 'Rosie', orgRole: 'member', inviteId: 'i1', inviteName: 'Rosa A.' },
        { userId: 8, name: 'Eli Grant', orgRole: 'member' },
      ],
    };
    const arrived: Member[] = [
      ...members,
      { id: 7, name: 'Rosie', role: 'member', present: true, presentBy: 'device' },
      // Marked present by the chair, and also in the headcount by a name typed differently
      { id: 8, name: 'Eli Grant', role: 'member', present: true, presentBy: 'chair' },
      { id: 9, name: 'Dee', role: 'guest', present: true, presentBy: 'device' },
    ];
    expect(
      countedTwice(arrived, withJoin, {
        headcount: 4,
        headcountNames: ['Dee', 'eli  grant', 'Ben Whitaker'],
        headcountInvites: ['i1'],
      }),
    ).toEqual([
      { name: 'Rosie', who: { inviteId: 'i1', name: 'Rosa A.' } },
      { name: 'Eli Grant', who: { name: 'eli  grant' } },
    ]);
  });
});

describe('eligibleCount', () => {
  it("takes the organization's number of voting members", () => {
    expect(eligibleCount({ eligibleVoters: 142 }, roster)).toBe(142);
  });

  it("counts the roster's voting members when the organization has no number", () => {
    expect(eligibleCount({ eligibleVoters: null }, roster)).toBe(4);
    expect(eligibleCount(null, roster)).toBe(4);
  });

  it('is unknown without either', () => {
    expect(eligibleCount(null, null)).toBeNull();
  });
});

describe('the quorum in words', () => {
  it('says how many more are needed, or that quorum is met', () => {
    expect(quorumLine(summary())).toBe('Need 24 more');
    expect(quorumLine(summary({ present: 30, hasQuorum: true }))).toBe('Quorum met');
  });

  it('puts attendance in one chip for the console', () => {
    expect(attendanceChip(summary(), 142)).toBe('5 present of 142, quorum 29, not met');
    expect(attendanceChip(summary({ present: 38, hasQuorum: true }), null)).toBe(
      '38 present, quorum 29, met',
    );
  });
});
