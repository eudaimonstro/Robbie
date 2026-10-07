import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { validateAction } from '../socket/actionValidator.js';

const member = (id: number, role: Member['role']): Member => ({
  id,
  name: `Member ${id}`,
  role,
  present: true,
  presentBy: 'device',
});
const chair = member(1, 'chair');
const speaker = member(2, 'member');
const other = member(3, 'member');
const guest = member(9, 'guest');
const state: MeetingState = {
  ...initialState,
  meetingActive: true,
  members: [chair, speaker, other, guest],
};

describe('who may act', () => {
  describe('YIELD_FLOOR', () => {
    const floor = { ...state, recognizedSpeaker: speaker };
    const yieldBy = (yieldedBy: number) =>
      validateAction(floor, { type: 'YIELD_FLOOR', yieldedBy, timestamp: '' });

    it('is for the speaker, or the chair ending their turn', () => {
      expect(yieldBy(2).valid).toBe(true);
      expect(yieldBy(1).valid).toBe(true);
      expect(yieldBy(3)).toMatchObject({ valid: false, errorCode: 'PERMISSION_DENIED' });
    });
  });

  describe('proxy requests', () => {
    const request = {
      id: 5,
      requestedBy: 2,
      requestedByName: 'Member 2',
      requestedFor: 3,
      requestedForName: 'Member 3',
      requestedAt: '20:00',
      scope: 'all' as const,
      status: 'pending' as const,
    };
    const asked = {
      ...state,
      allowProxyVoting: true,
      allowMemberProxyGrant: true,
      pendingProxyRequests: [request],
    };

    it('are accepted or declined only by the member asked', () => {
      const accept = (acceptedBy: number) =>
        validateAction(asked, {
          type: 'ACCEPT_PROXY',
          requestId: 5,
          proxyId: 1,
          acceptedBy,
          timestamp: '',
        });
      expect(accept(3).valid).toBe(true);
      expect(accept(2)).toMatchObject({ valid: false, errorCode: 'PERMISSION_DENIED' });

      const decline = (declinedBy: number) =>
        validateAction(asked, { type: 'DECLINE_PROXY', requestId: 5, declinedBy, timestamp: '' });
      expect(decline(3).valid).toBe(true);
      expect(decline(1)).toMatchObject({ valid: false, errorCode: 'PERMISSION_DENIED' });
    });

    it('are canceled only by the member who asked', () => {
      const cancel = (canceledBy: number) =>
        validateAction(asked, {
          type: 'CANCEL_PROXY_REQUEST',
          requestId: 5,
          canceledBy,
          timestamp: '',
        });
      expect(cancel(2).valid).toBe(true);
      expect(cancel(3)).toMatchObject({ valid: false, errorCode: 'PERMISSION_DENIED' });
    });

    it('cannot ask a guest to hold a proxy', () => {
      const result = validateAction(
        { ...asked, pendingProxyRequests: [] },
        {
          type: 'REQUEST_PROXY',
          requestId: 6,
          requestedBy: 2,
          requestedByName: 'Member 2',
          requestedFor: 9,
          requestedForName: 'Member 9',
          scope: 'all',
          timestamp: '',
        },
      );
      expect(result).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
    });
  });

  describe('guests', () => {
    it('cannot be nominated', () => {
      const open = { ...state, nominationsOpen: true, currentNominationPosition: 'Director' };
      const nominate = (nomineeId: number) =>
        validateAction(open, {
          type: 'NOMINATE',
          position: 'Director',
          nomineeName: `Member ${nomineeId}`,
          nomineeId,
          nominatedBy: 'Member 2',
          nominatorId: 2,
          nominationId: 1,
          timestamp: '',
        });
      expect(nominate(9)).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
      expect(nominate(3).valid).toBe(true);
    });

    it('cannot hold or grant a proxy', () => {
      const grant = (grantedBy: number, grantedTo: number) =>
        validateAction(
          { ...state, allowProxyVoting: true },
          {
            type: 'GRANT_PROXY',
            proxyId: 1,
            grantedBy,
            grantedTo,
            grantedByName: '',
            grantedToName: '',
            scope: 'all',
            timestamp: '',
          },
        );
      expect(grant(9, 2)).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
      expect(grant(2, 9)).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
      expect(grant(3, 2).valid).toBe(true);
    });

    it('cannot take the chair', () => {
      const result = validateAction(state, {
        type: 'SET_MEMBER_ROLE',
        targetMemberId: 9,
        newRole: 'chair',
        timestamp: '',
      });
      expect(result).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
    });
  });
});
