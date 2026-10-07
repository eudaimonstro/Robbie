import { describe, it, expect } from 'vitest';
import type { AttendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { Member } from '@robbie-bylawyer/shared/types';
import type { MeetingRoster } from '../../../../api/client';
import { attendanceChip, eligibleCount, quorumLine, rosterRows } from '../attendance';

const roster: MeetingRoster = {
  members: [
    { userId: 2, name: 'Dana Okafor', email: 'dana@maplegrove.example', orgRole: 'admin' },
    { userId: 3, name: 'Alice Brennan', email: 'alice@maplegrove.example', orgRole: 'member' },
    { userId: 4, name: 'Ben Whitaker', email: 'ben@maplegrove.example', orgRole: 'member' },
    { userId: 5, name: null, email: 'carmen@maplegrove.example', orgRole: 'member' },
    { userId: 9, name: 'Morgan Lee', email: 'morgan@maplegrove.example', orgRole: 'viewer' },
  ],
  invites: [{ email: 'new@maplegrove.example', role: 'member' }],
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

  it('counts a present member saved without a reason as on a device', () => {
    const rows = rosterRows(roster, [{ id: 2, name: 'Dana Okafor', role: 'chair', present: true }]);
    expect(rows.find((r) => r.userId === 2)?.status).toBe('connected');
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
