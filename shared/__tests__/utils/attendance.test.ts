import { describe, it, expect } from 'vitest';
import { initialState } from '../../reducer/index.js';
import { attendanceSummary, isQuorumSet, quorumFromSettings } from '../../utils/index.js';
import type { MeetingState, Member } from '../../types/index.js';

const member = (id: number, present: boolean, extra: Partial<Member> = {}): Member => ({
  id,
  name: `Member ${id}`,
  role: 'member',
  present,
  ...(present ? { presentBy: 'device' as const } : {}),
  ...extra,
});

describe('attendanceSummary', () => {
  it('counts devices, members marked present and the headcount, never guests', () => {
    const state: MeetingState = {
      ...initialState,
      quorum: 5,
      headcount: 2,
      members: [
        member(1, true),
        member(2, true, { role: 'chair' }),
        member(3, true, { presentBy: 'chair' }),
        member(4, false),
        member(5, true, { role: 'guest' }),
        member(6, false, { role: 'guest' }),
      ],
    };
    expect(attendanceSummary(state)).toEqual({
      devicePresent: 2,
      markedPresent: 1,
      headcount: 2,
      proxies: 0,
      proxiesHeld: 0,
      present: 5,
      quorum: 5,
      hasQuorum: true,
      guests: 1,
    });
  });

  it('counts a present member saved without a reason as on a device', () => {
    const state = {
      ...initialState,
      members: [{ id: 1, name: 'A', role: 'member' as const, present: true }],
    };
    expect(attendanceSummary(state).devicePresent).toBe(1);
  });

  it('counts absent members represented by a present proxy holder, when proxies count', () => {
    const proxy = {
      id: 1,
      grantedBy: 2,
      grantedTo: 1,
      grantedByName: 'Member 2',
      grantedToName: 'Member 1',
      grantedAt: '10:00',
      scope: 'all' as const,
    };
    const state: MeetingState = {
      ...initialState,
      quorum: 2,
      members: [member(1, true), member(2, false)],
      proxies: [proxy],
    };
    expect(attendanceSummary(state)).toMatchObject({ proxies: 0, present: 1, hasQuorum: false });
    const counting = { ...state, proxiesCountForQuorum: true };
    expect(attendanceSummary(counting)).toMatchObject({ proxies: 1, present: 2, hasQuorum: true });
  });

  it('reads a state saved before the headcount existed', () => {
    const { headcount: _h, headcountNames: _n, ...old } = initialState;
    expect(attendanceSummary(old as MeetingState).headcount).toBe(0);
  });

  it('counts the proxies and absentee ballots held toward quorum, apart from the room', () => {
    const state: MeetingState = {
      ...initialState,
      quorum: 25,
      headcount: 3,
      proxiesHeld: 21,
      members: [member(1, true)],
    };
    expect(attendanceSummary(state)).toMatchObject({
      devicePresent: 1,
      headcount: 3,
      proxiesHeld: 21,
      present: 25,
      hasQuorum: true,
    });
  });

  it('reads a state saved before the proxies held existed', () => {
    const { proxiesHeld: _p, ...old } = initialState;
    expect(attendanceSummary(old as MeetingState).proxiesHeld).toBe(0);
  });
});

describe('isQuorumSet', () => {
  it('needs the voting members and a quorum, either way', () => {
    expect(isQuorumSet({ eligibleVoters: 142, quorumPercent: 20, quorumCount: null })).toBe(true);
    expect(isQuorumSet({ eligibleVoters: 142, quorumPercent: null, quorumCount: 29 })).toBe(true);
    // The old default: a count of 3 and no voting members
    expect(isQuorumSet({ eligibleVoters: null, quorumPercent: null, quorumCount: 3 })).toBe(false);
    expect(isQuorumSet({ eligibleVoters: 142, quorumPercent: null, quorumCount: null })).toBe(
      false,
    );
  });
});

describe('quorumFromSettings', () => {
  it('takes a percentage of the eligible voters, rounded up', () => {
    expect(
      quorumFromSettings({ eligibleVoters: 142, quorumPercent: 20, quorumCount: null }, 9),
    ).toBe(29);
  });

  it('takes a percentage of the roster when the organization has no count', () => {
    expect(
      quorumFromSettings({ eligibleVoters: null, quorumPercent: 50, quorumCount: null }, 9),
    ).toBe(5);
    expect(
      quorumFromSettings({ eligibleVoters: null, quorumPercent: 50, quorumCount: null }, 0),
    ).toBe(1);
  });

  it('takes a fixed count, 3 when nothing is set', () => {
    expect(
      quorumFromSettings({ eligibleVoters: 142, quorumPercent: null, quorumCount: 25 }, 9),
    ).toBe(25);
    expect(
      quorumFromSettings({ eligibleVoters: null, quorumPercent: null, quorumCount: null }, 9),
    ).toBe(3);
  });
});
