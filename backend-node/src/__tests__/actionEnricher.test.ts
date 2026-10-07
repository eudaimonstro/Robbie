import { describe, it, expect } from 'vitest';
import type { MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import type { SocketData } from '@robbie-bylawyer/shared/types/socket';
import { ACTOR_FIELDS, enrichAction } from '../socket/actionEnricher.js';
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

    const withActor = ACTION_TYPES.filter((type) => Object.keys(ACTOR_FIELDS[type]).length > 0);

    it.each(withActor)('%s: a forged actor is replaced with the signed-in member', (type) => {
      const { id, name, member: asMember } = ACTOR_FIELDS[type];
      const forged: Record<string, unknown> = { type };
      if (id) forged[id] = 999;
      if (name) forged[name] = 'Spoof';
      if (asMember) forged.member = { id: 999, name: 'Spoof', role: 'chair', present: true };

      const enriched = enrich(forged);
      if (id) expect(enriched[id]).toBe(20);
      if (name) expect(enriched[name]).toBe('Renamed Member');
      if (asMember) expect(enriched.member).toEqual(memberInMeeting);
    });

    it('covers the fields that name who acts', () => {
      expect(ACTOR_FIELDS).toMatchObject({
        MAKE_MOTION: { id: 'moverId', name: 'mover' },
        SECOND_MOTION: { id: 'seconderId', name: 'seconder' },
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
        RENAME_MEMBER: { id: 'renamedBy' },
        WITHDRAW_MOTION: { id: 'requesterId' },
        MODIFY_MOTION: { id: 'requesterId' },
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

    it('leaves alone the fields that name someone else', () => {
      const speaker = { id: 30, name: 'Speaker', role: 'member', present: true };
      expect(enrich({ type: 'RECOGNIZE_SPEAKER', member: speaker }, chair).member).toEqual(speaker);
      const nomination = enrich({ type: 'NOMINATE', nomineeId: 30, nomineeName: 'Speaker' });
      expect(nomination).toMatchObject({ nomineeId: 30, nomineeName: 'Speaker' });
      expect(enrich({ type: 'MARK_ABSENT', memberId: 30 }, chair).memberId).toBe(30);
      expect(enrich({ type: 'RENAME_MEMBER', memberId: 30 }, chair).memberId).toBe(30);
      // A chair or admin grants a proxy for the absent member it names
      const grant = enrich({ type: 'GRANT_PROXY', grantedBy: 30, grantedTo: 40 }, chair);
      expect(grant).toMatchObject({ grantedBy: 30, grantedTo: 40 });
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
