import { describe, it, expect, vi } from 'vitest';
import type { MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import type { SocketData } from '@robbie-bylawyer/shared/types/socket';
import { ACTOR_FIELDS, CLOCKED_ACTIONS, enrichAction } from '../socket/actionEnricher.js';
import { ACTION_TYPES } from '../socket/permissionGuard.js';

const chair: SocketData = {
  userId: 10,
  email: 'chair@example.com',
  name: 'Chair',
  sessionId: 'session-1',
  meetingCode: 'TEST01',
  role: 'chair',
};
const member: SocketData = {
  ...chair,
  userId: 20,
  email: 'm@example.com',
  name: 'Member',
  role: 'member',
};
// The member as the meeting has them: renamed since signing in
const memberInMeeting: Member = { id: 20, name: 'Renamed Member', role: 'member', present: true };

const enrich = (action: Record<string, unknown>, socket: SocketData = member) =>
  enrichAction(action as unknown as MeetingAction, socket, [memberInMeeting]) as unknown as Record<
    string,
    unknown
  >;

describe('enrichAction', () => {
  describe('who is acting', () => {
    // Every action type has an entry, so a new one can't be added without deciding
    it('is decided for every action type', () => {
      expect(Object.keys(ACTOR_FIELDS).sort()).toEqual([...ACTION_TYPES].sort());
    });

    // Every field of the action union that says who sent the action, or that the server works
    // out about the sender, each holding a forged value. Kept by hand from the union, not from
    // ACTOR_FIELDS, so a field the enricher's table leaves out is caught here.
    const SPOOF_ID = 999;
    const SPOOF_NAME = 'Spoof';
    const SPOOF_MEMBER = { id: SPOOF_ID, name: SPOOF_NAME, role: 'chair', present: true };
    const SENDER_FIELDS: Record<MeetingAction['type'], Record<string, unknown>> = {
      START_MEETING: {},
      END_MEETING: {},
      MAKE_MOTION: { moverId: SPOOF_ID, mover: SPOOF_NAME },
      // The mover and seconder from the floor name someone else; the sender only records them
      MAKE_FLOOR_MOTION: { recordedBy: SPOOF_ID },
      SECOND_MOTION: { seconderId: SPOOF_ID, seconder: SPOOF_NAME },
      SECOND_FROM_FLOOR: { recordedBy: SPOOF_ID },
      DECLINE_SECOND: {},
      OPEN_VOTING: {},
      CAST_VOTE: { voterId: SPOOF_ID },
      CLOSE_VOTING: {},
      SET_FLOOR_TALLY: {},
      RAISE_HAND: { member: SPOOF_MEMBER },
      LOWER_HAND: { member: SPOOF_MEMBER },
      RECOGNIZE_SPEAKER: {},
      YIELD_FLOOR: { yieldedBy: SPOOF_ID },
      ADD_AGENDA_ITEM: {},
      REMOVE_AGENDA_ITEM: {},
      ADOPT_AGENDA: {},
      AGENDA_OBJECTION: { objectorId: SPOOF_ID },
      CALL_AGENDA_ITEM: {},
      COMPLETE_AGENDA_ITEM: {},
      REORDER_AGENDA: {},
      RELOAD_AGENDA: {},
      SET_SPEAKER_TIME_LIMIT: {},
      SET_VOTE_TIME_LIMIT: {},
      REQUEST_UNANIMOUS_CONSENT: {},
      OBJECT_TO_CONSENT: { objectorId: SPOOF_ID, objector: SPOOF_NAME },
      UNANIMOUS_CONSENT_PASSED: {},
      SET_VOTING_METHOD: {},
      ADVANCE_MEETING_STAGE: {},
      SET_MEETING_STAGE: {},
      SET_QUORUM: {},
      APPROVE_MINUTES: {},
      SET_PREVIOUS_MINUTES: {},
      ADD_COMMITTEE_REPORT: {},
      PRESENT_COMMITTEE_REPORT: {},
      SUSPEND_RULE_APPROVED: {},
      RESTORE_RULE: {},
      CHAIR_RULING: {},
      OPEN_NOMINATIONS: {},
      NOMINATE: { nominatorId: SPOOF_ID, nominatedBy: SPOOF_NAME },
      DECLINE_NOMINATION: { declinedBy: SPOOF_ID },
      CLOSE_NOMINATIONS: {},
      START_ELECTION: {},
      CAST_BALLOT: { voterId: SPOOF_ID },
      CLOSE_ELECTION: {},
      SET_FLOOR_BALLOTS: {},
      DECLARE_ELECTED: {},
      SET_ASIDE_ELECTION: {},
      ASK_INQUIRY: { askerId: SPOOF_ID, askedBy: SPOOF_NAME },
      ANSWER_INQUIRY: { answeredBy: SPOOF_NAME },
      // The server finds the chair being replaced; a client can't name one
      SET_MEMBER_ROLE: { changedById: SPOOF_ID, changedBy: SPOOF_NAME, previousChairId: SPOOF_ID },
      ADD_MEMBER: {},
      SET_MEMBER_PRESENCE: {},
      REFRESH_MEMBERS: {},
      SET_MEETING_INFO: {},
      MARK_PRESENT: {},
      SET_HEADCOUNT: {},
      WITHDRAW_MOTION: { requesterId: SPOOF_ID },
      MODIFY_MOTION: { requesterId: SPOOF_ID },
      TAKE_UP_POSTPONED: {},
      RESUME_MEETING: {},
      REQUEST_DIVISION: { requesterId: SPOOF_ID },
      START_ROLL_CALL: {},
      RESPOND_ROLL_CALL: { memberId: SPOOF_ID },
      COMPLETE_ROLL_CALL: {},
      MARK_ABSENT: {},
      SET_AUTO_YIELD: {},
      SET_PROXY_SETTINGS: {},
      GRANT_PROXY: {},
      REVOKE_PROXY: {},
      CAST_PROXY_VOTE: { castById: SPOOF_ID },
      REQUEST_PROXY: { requestedBy: SPOOF_ID, requestedByName: SPOOF_NAME },
      ACCEPT_PROXY: { acceptedBy: SPOOF_ID },
      DECLINE_PROXY: { declinedBy: SPOOF_ID },
      CANCEL_PROXY_REQUEST: { canceledBy: SPOOF_ID },
    };

    it('has a fixture for every action type', () => {
      expect(Object.keys(SENDER_FIELDS).sort()).toEqual([...ACTION_TYPES].sort());
    });

    const withSender = ACTION_TYPES.filter((type) => Object.keys(SENDER_FIELDS[type]).length > 0);

    it.each(withSender)('%s: no forged field about the sender survives', (type) => {
      const fields = SENDER_FIELDS[type];
      const enriched = enrich({ type, ...fields });
      for (const [field, forged] of Object.entries(fields)) {
        expect(enriched[field], field).not.toEqual(forged);
      }
    });

    it('replaces a forged actor with the signed-in member', () => {
      expect(enrich({ type: 'MAKE_MOTION', moverId: 999, mover: 'Spoof' })).toMatchObject({
        moverId: 20,
        mover: 'Renamed Member',
      });
      expect(enrich({ type: 'RAISE_HAND', member: SPOOF_MEMBER }).member).toEqual(memberInMeeting);
    });

    it('drops a previous chair a client names: the server finds the chair being replaced', () => {
      const enriched = enrich(
        { type: 'SET_MEMBER_ROLE', targetMemberId: 30, newRole: 'chair', previousChairId: 999 },
        chair,
      );
      expect(enriched).not.toHaveProperty('previousChairId');
      expect(enriched).toMatchObject({ targetMemberId: 30, changedById: 10, changedBy: 'Chair' });
    });

    it('covers the fields that name who acts', () => {
      expect(ACTOR_FIELDS).toMatchObject({
        MAKE_MOTION: { id: 'moverId', name: 'mover' },
        MAKE_FLOOR_MOTION: { id: 'recordedBy' },
        SECOND_MOTION: { id: 'seconderId', name: 'seconder' },
        SECOND_FROM_FLOOR: { id: 'recordedBy' },
        CAST_VOTE: { id: 'voterId' },
        CAST_BALLOT: { id: 'voterId' },
        ASK_INQUIRY: { id: 'askerId', name: 'askedBy' },
        ANSWER_INQUIRY: { name: 'answeredBy' },
        NOMINATE: { id: 'nominatorId', name: 'nominatedBy' },
        OBJECT_TO_CONSENT: { id: 'objectorId', name: 'objector' },
        AGENDA_OBJECTION: { id: 'objectorId' },
        CAST_PROXY_VOTE: { id: 'castById' },
        REQUEST_PROXY: { id: 'requestedBy', name: 'requestedByName' },
        ACCEPT_PROXY: { id: 'acceptedBy' },
        DECLINE_PROXY: { id: 'declinedBy' },
        CANCEL_PROXY_REQUEST: { id: 'canceledBy' },
        WITHDRAW_MOTION: { id: 'requesterId' },
        MODIFY_MOTION: { id: 'requesterId' },
        REQUEST_DIVISION: { id: 'requesterId' },
        RAISE_HAND: { member: true },
        LOWER_HAND: { member: true },
        YIELD_FLOOR: { id: 'yieldedBy' },
        RESPOND_ROLL_CALL: { id: 'memberId' },
        SET_MEMBER_ROLE: { id: 'changedById', name: 'changedBy' },
      });
    });

    it('uses the signed-in name for a member not yet in the meeting', () => {
      const enriched = enrichAction(
        { type: 'MAKE_MOTION', motionId: 1, mover: 'x', moverId: 99 } as unknown as MeetingAction,
        chair,
      ) as unknown as Record<string, unknown>;
      expect(enriched).toMatchObject({ mover: 'Chair', moverId: 10 });
    });

    it('recognizes the speaker as the meeting has them', () => {
      const stale = { id: 20, name: 'Old Name', role: 'member', present: true, extra: 1 };
      const enriched = enrichAction(
        { type: 'RECOGNIZE_SPEAKER', member: stale } as unknown as MeetingAction,
        chair,
        [memberInMeeting],
      ) as unknown as Record<string, unknown>;
      expect(enriched.member).toEqual(memberInMeeting);
    });

    it('leaves alone the fields that name someone else', () => {
      const speaker = { id: 30, name: 'Speaker', role: 'member', present: true };
      expect(enrich({ type: 'RECOGNIZE_SPEAKER', member: speaker }, chair).member).toEqual(speaker);
      const nomination = enrich({ type: 'NOMINATE', nomineeId: 30, nomineeName: 'Speaker' });
      expect(nomination).toMatchObject({ nomineeId: 30, nomineeName: 'Speaker' });
      expect(enrich({ type: 'MARK_ABSENT', memberId: 30 }, chair).memberId).toBe(30);
      // The chair records business from the floor for the people it names, never as the mover
      const floor = enrich(
        { type: 'MAKE_FLOOR_MOTION', moverMemberId: 30, moverName: 'Speaker', motionId: 1 },
        chair,
      );
      expect(floor).toMatchObject({ moverMemberId: 30, moverName: 'Speaker', recordedBy: 10 });
      expect(floor).not.toHaveProperty('moverId');
      expect(floor).not.toHaveProperty('mover');
      const seconded = enrich(
        { type: 'SECOND_FROM_FLOOR', seconderMemberId: 30, seconderName: 'Speaker' },
        chair,
      );
      expect(seconded).toMatchObject({ seconderMemberId: 30, seconderName: 'Speaker' });
      expect(seconded).not.toHaveProperty('seconderId');
      expect(enrich({ type: 'NOMINATE', fromFloor: true }, chair)).toMatchObject({
        fromFloor: true,
        nominatorId: 10,
      });
      // A chair or admin grants a proxy for the absent member it names
      const grant = enrich({ type: 'GRANT_PROXY', grantedBy: 30, grantedTo: 40 }, chair);
      expect(grant).toMatchObject({ grantedBy: 30, grantedTo: 40 });
    });

    it('names the members of a proxy as the meeting has them, not as the client says', () => {
      const members: Member[] = [
        memberInMeeting,
        { id: 30, name: 'Absent Member', role: 'member', present: false },
        { id: 40, name: 'Holder', role: 'member', present: true },
      ];
      const grant = enrichAction(
        {
          type: 'GRANT_PROXY',
          proxyId: 1,
          grantedBy: 30,
          grantedTo: 40,
          grantedByName: 'Spoof',
          grantedToName: 'Spoof',
          scope: 'all',
          timestamp: '',
        },
        chair,
        members,
      );
      expect(grant).toMatchObject({ grantedByName: 'Absent Member', grantedToName: 'Holder' });

      const request = enrichAction(
        {
          type: 'REQUEST_PROXY',
          requestId: 1,
          requestedBy: 999,
          requestedByName: 'Spoof',
          requestedFor: 40,
          requestedForName: 'Spoof',
          scope: 'all',
          timestamp: '',
        },
        member,
        members,
      );
      expect(request).toMatchObject({
        requestedBy: 20,
        requestedByName: 'Renamed Member',
        requestedForName: 'Holder',
      });
    });

    it('drops a client-sent person from MARK_PRESENT: the server reads the roster', () => {
      const enriched = enrich(
        { type: 'MARK_PRESENT', userId: 30, member: { id: 30, role: 'admin' } },
        chair,
      );
      expect(enriched.userId).toBe(30);
      expect(enriched).not.toHaveProperty('member');
    });
  });

  describe('IDs for new items', () => {
    it.each([
      ['MAKE_MOTION', 'motionId'],
      ['MAKE_FLOOR_MOTION', 'motionId'],
      ['ADD_AGENDA_ITEM', 'itemId'],
      ['NOMINATE', 'nominationId'],
      ['START_ELECTION', 'electionId'],
      ['ASK_INQUIRY', 'inquiryId'],
    ])('%s gets a server-generated %s', (type, field) => {
      const enriched = enrich({ type, [field]: 1 });
      expect(enriched[field]).not.toBe(1);
      expect(typeof enriched[field]).toBe('number');
    });
  });

  describe('IDs that reference existing items', () => {
    it('DECLINE_NOMINATION keeps the nomination being declined', () => {
      expect(enrich({ type: 'DECLINE_NOMINATION', nominationId: 42 }).nominationId).toBe(42);
    });

    it('ANSWER_INQUIRY keeps the inquiry being answered', () => {
      const enriched = enrich(
        { type: 'ANSWER_INQUIRY', inquiryId: 42, answer: 'Yes', answeredBy: 'Someone' },
        chair,
      );
      expect(enriched.inquiryId).toBe(42);
      expect(enriched.answeredBy).toBe('Chair');
    });
  });
});

describe('the clock on decisions', () => {
  it('stamps each decision the minutes record with when it happened, whatever a client says', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T19:42:00Z'));
    try {
      expect([...CLOCKED_ACTIONS].sort()).toEqual([
        'APPROVE_MINUTES',
        'CHAIR_RULING',
        'CLOSE_VOTING',
        'DECLARE_ELECTED',
        'DECLINE_SECOND',
        'RESUME_MEETING',
        'SET_ASIDE_ELECTION',
        'UNANIMOUS_CONSENT_PASSED',
        'WITHDRAW_MOTION',
      ]);
      for (const type of CLOCKED_ACTIONS) {
        const stamped = enrich({ type, timestamp: '', at: '1999-01-01T00:00:00.000Z' }, chair);
        expect(stamped.at, type).toBe('2026-10-20T19:42:00.000Z');
      }
      expect(enrich({ type: 'OPEN_VOTING', timestamp: '' }, chair)).not.toHaveProperty('at');
    } finally {
      vi.useRealTimers();
    }
  });
});
