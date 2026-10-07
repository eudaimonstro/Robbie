import { describe, it, expect } from 'vitest';
import { meetingReducer, initialState } from '../../reducer/index.js';
import type { MeetingState, Member } from '../../types/index.js';

const ann: Member = { id: 1, name: 'Ann', role: 'member', present: true, presentBy: 'device' };
const bo: Member = { id: 2, name: 'Bo', role: 'member', present: false };
const state: MeetingState = { ...initialState, members: [ann, bo] };

describe('attendance actions', () => {
  describe('SET_MEMBER_PRESENCE', () => {
    it('marks a connecting device present, and clears the reason when it leaves', () => {
      const joined = meetingReducer(state, {
        type: 'SET_MEMBER_PRESENCE',
        memberId: 2,
        present: true,
        timestamp: '10:00',
      });
      expect(joined.members[1]).toEqual({ ...bo, present: true, presentBy: 'device' });
      expect(joined.meetingLog.at(-1)?.message).toBe('Bo is now present.');

      const left = meetingReducer(joined, {
        type: 'SET_MEMBER_PRESENCE',
        memberId: 2,
        present: false,
        timestamp: '10:05',
      });
      expect(left.members[1]).toEqual(bo);
      expect(left.members[1]).not.toHaveProperty('presentBy');
    });

    it('changes nothing, and logs nothing, when a present device reconnects', () => {
      const again = meetingReducer(state, {
        type: 'SET_MEMBER_PRESENCE',
        memberId: 1,
        present: true,
        timestamp: '10:00',
      });
      expect(again).toBe(state);
    });

    it('keeps a member marked present by the chair marked when their device connects', () => {
      const marked: MeetingState = {
        ...state,
        members: [ann, { ...bo, present: true, presentBy: 'chair' }],
      };
      const connected = meetingReducer(marked, {
        type: 'SET_MEMBER_PRESENCE',
        memberId: 2,
        present: true,
        presentBy: 'device',
        timestamp: '10:00',
      });
      expect(connected).toBe(marked);
    });
  });

  describe('MARK_PRESENT', () => {
    const fromRoster: Member = { id: 3, name: 'Cy', role: 'member', present: true };

    it('adds a person from the roster, marked present by the chair', () => {
      const next = meetingReducer(state, {
        type: 'MARK_PRESENT',
        userId: 3,
        member: fromRoster,
        timestamp: '10:00',
      });
      expect(next.members[2]).toEqual({ ...fromRoster, present: true, presentBy: 'chair' });
      expect(next.meetingLog.at(-1)?.message).toBe('Cy marked present.');
    });

    it('marks an absent member present, and a device-present one as marked', () => {
      const bob = meetingReducer(state, {
        type: 'MARK_PRESENT',
        userId: 2,
        member: { ...bo, present: true },
        timestamp: '10:00',
      });
      expect(bob.members[1]).toEqual({ ...bo, present: true, presentBy: 'chair' });

      const annMarked = meetingReducer(state, {
        type: 'MARK_PRESENT',
        userId: 1,
        member: ann,
        timestamp: '10:00',
      });
      expect(annMarked.members[0].presentBy).toBe('chair');
    });

    it('does nothing without the roster entry the server fills in', () => {
      const next = meetingReducer(state, { type: 'MARK_PRESENT', userId: 3, timestamp: '10:00' });
      expect(next).toBe(state);
      const wrong = meetingReducer(state, {
        type: 'MARK_PRESENT',
        userId: 4,
        member: fromRoster,
        timestamp: '10:00',
      });
      expect(wrong).toBe(state);
    });
  });

  describe('MARK_ABSENT', () => {
    it('clears the reason a member was present', () => {
      const marked: MeetingState = {
        ...state,
        members: [{ ...ann, presentBy: 'chair' }, bo],
      };
      const next = meetingReducer(marked, {
        type: 'MARK_ABSENT',
        memberId: 1,
        excused: false,
        timestamp: '10:00',
      });
      expect(next.members[0]).toEqual({ id: 1, name: 'Ann', role: 'member', present: false });
    });
  });

  describe('SET_HEADCOUNT', () => {
    it('replaces the count and the names, which are trimmed', () => {
      const first = meetingReducer(state, {
        type: 'SET_HEADCOUNT',
        count: 3,
        names: [' Dee ', '', 'Eli'],
        timestamp: '10:00',
      });
      expect(first.headcount).toBe(3);
      expect(first.headcountNames).toEqual(['Dee', 'Eli']);
      expect(first.meetingLog.at(-1)?.message).toBe('3 people present without an account.');

      const corrected = meetingReducer(first, {
        type: 'SET_HEADCOUNT',
        count: 1,
        names: [],
        timestamp: '10:05',
      });
      expect(corrected.headcount).toBe(1);
      expect(corrected.headcountNames).toEqual([]);
      expect(corrected.meetingLog.at(-1)?.message).toBe('1 person present without an account.');
    });

    it('logs nothing when nothing changes', () => {
      const same = { ...state, headcount: 2, headcountNames: ['Dee'] };
      const next = meetingReducer(same, {
        type: 'SET_HEADCOUNT',
        count: 2,
        names: ['Dee'],
        timestamp: '10:00',
      });
      expect(next).toBe(same);
    });
  });

  describe('REFRESH_MEMBERS', () => {
    it('updates names and roles, keeping one chair, and logs nothing', () => {
      const withChair: MeetingState = {
        ...state,
        members: [{ ...ann, role: 'chair' }, bo],
      };
      const next = meetingReducer(withChair, {
        type: 'REFRESH_MEMBERS',
        members: [{ id: 2, name: 'Bo Brown', role: 'chair' }],
        timestamp: '10:00',
      });
      expect(next.members).toEqual([
        { ...ann, role: 'member' },
        { ...bo, name: 'Bo Brown', role: 'chair' },
      ]);
      expect(next.meetingLog).toEqual([]);
    });

    it('revokes the proxies of a member who became a guest, held or granted', () => {
      const proxy = (id: number, grantedBy: number, grantedTo: number) => ({
        id,
        grantedBy,
        grantedTo,
        grantedByName: `Member ${grantedBy}`,
        grantedToName: `Member ${grantedTo}`,
        grantedAt: '10:00',
        scope: 'all' as const,
      });
      const cy: Member = { id: 3, name: 'Cy', role: 'member', present: true };
      const withProxies: MeetingState = {
        ...state,
        members: [ann, bo, cy],
        proxies: [proxy(1, 2, 1), proxy(2, 3, 1), proxy(3, 1, 3)],
      };
      const next = meetingReducer(withProxies, {
        type: 'REFRESH_MEMBERS',
        members: [{ id: 1, name: 'Ann', role: 'guest' }],
        timestamp: '10:00',
      });
      // Ann can neither hold Bo's and Cy's proxies nor grant one to Cy
      expect(next.proxies).toEqual([]);
      const unchanged = meetingReducer(withProxies, {
        type: 'REFRESH_MEMBERS',
        members: [{ id: 2, name: 'Bo', role: 'admin' }],
        timestamp: '10:00',
      });
      expect(unchanged.proxies).toEqual(withProxies.proxies);
    });
  });

  describe('SET_MEETING_INFO', () => {
    it("sets the meeting's organization, title and date from its packet", () => {
      const next = meetingReducer(state, {
        type: 'SET_MEETING_INFO',
        organizationId: 'org-1',
        title: 'October meeting',
        scheduledFor: '2026-10-20T19:00:00.000Z',
        timestamp: '9:00',
      });
      expect(next).toMatchObject({
        organizationId: 'org-1',
        title: 'October meeting',
        scheduledFor: '2026-10-20T19:00:00.000Z',
      });
      expect(next.meetingLog).toEqual([]);
    });
  });

  describe('RELOAD_AGENDA', () => {
    it('replaces the agenda, not yet adopted', () => {
      const adopted: MeetingState = {
        ...state,
        agenda: [{ id: 1, title: 'Old', status: 'pending' }],
        agendaAdopted: true,
      };
      const agenda = [
        { id: 7, title: 'Call to order', status: 'pending' as const, packetItemId: 'item-1' },
      ];
      const next = meetingReducer(adopted, { type: 'RELOAD_AGENDA', agenda, timestamp: '9:00' });
      expect(next.agenda).toEqual(agenda);
      expect(next.agendaAdopted).toBe(false);
      expect(next.currentAgendaItem).toBeNull();
    });
  });

  describe('START_ROLL_CALL', () => {
    it('leaves guests out of the roll', () => {
      const withGuest: MeetingState = {
        ...state,
        members: [ann, { id: 9, name: 'Guest', role: 'guest', present: true }],
      };
      const next = meetingReducer(withGuest, { type: 'START_ROLL_CALL', timestamp: '10:00' });
      expect(next.rollCall?.responses.map((r) => r.memberId)).toEqual([1]);
    });
  });
});
