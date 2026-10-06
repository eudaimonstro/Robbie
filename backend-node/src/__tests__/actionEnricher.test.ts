import { describe, it, expect } from 'vitest';
import type { MeetingAction } from '@robbie-bylawyer/shared/types';
import type { SocketData } from '@robbie-bylawyer/shared/types/socket';
import { enrichAction } from '../socket/actionEnricher.js';

const chair: SocketData = {
  userId: 10,
  email: 'chair@example.com',
  name: 'Chair',
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

const enrich = (action: Record<string, unknown>, socket: SocketData = member) =>
  enrichAction(action as unknown as MeetingAction, socket) as unknown as Record<string, unknown>;

describe('enrichAction', () => {
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

  describe('identity fields', () => {
    it('sets the mover to the signed-in user', () => {
      const enriched = enrich({ type: 'MAKE_MOTION', motionId: 1, mover: 'Spoof', moverId: 99 });
      expect(enriched.moverId).toBe(20);
      expect(enriched.mover).toBe('Member');
    });

    it("uses the member's current name, so a rename shows on later actions", () => {
      // The login token still carries the old name ('Member')
      const members = [{ id: 20, name: 'Renamed Member', role: 'member' as const, present: true }];
      const enriched = enrichAction(
        { type: 'MAKE_MOTION', motionId: 1, mover: 'x', moverId: 99 } as unknown as MeetingAction,
        member,
        members,
      ) as unknown as Record<string, unknown>;
      expect(enriched.mover).toBe('Renamed Member');
    });

    it('records who seconded a motion', () => {
      expect(enrich({ type: 'SECOND_MOTION', seconder: 'x' }).seconderId).toBe(20);
    });

    it('sets a proxy request to come from the signed-in user', () => {
      expect(enrich({ type: 'REQUEST_PROXY', requestedBy: 99 }).requestedBy).toBe(20);
    });

    it('keeps the absent member on a proxy the chair grants for them', () => {
      const enriched = enrich(
        { type: 'GRANT_PROXY', proxyId: 1, grantedBy: 30, grantedTo: 40, grantedByName: 'Absent' },
        chair,
      );
      expect(enriched.grantedBy).toBe(30);
    });
  });
});
