import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { ACTOR_FIELDS } from '../socket/actionEnricher.js';
import { validateAction } from '../socket/actionValidator.js';
import { ACTION_TYPES, checkPermission } from '../socket/permissionGuard.js';

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
    // The actor the enricher stamps from the socket is the guest (9), in every action a guest
    // may not send. The socket's role may be stale (a membership removed since it joined, a
    // recovered socket): the state's role decides.
    const asGuest: Partial<Record<MeetingAction['type'], MeetingAction>> = {
      CAST_VOTE: { type: 'CAST_VOTE', vote: 'yea', voterId: 9 },
      MAKE_MOTION: {
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: 'Resurface the pool',
        mover: 'Member 9',
        moverId: 9,
        motionId: 1,
        timestamp: '',
      },
      SECOND_MOTION: { type: 'SECOND_MOTION', seconder: 'Member 9', seconderId: 9, timestamp: '' },
      CAST_BALLOT: { type: 'CAST_BALLOT', candidateName: 'Ann', voterId: 9 },
      // A presiding socket whose member the meeting now has as a guest
      SET_MEMBER_ROLE: {
        type: 'SET_MEMBER_ROLE',
        targetMemberId: 2,
        newRole: 'chair',
        changedBy: 'Member 9',
        changedById: 9,
        timestamp: '',
      },
      RESPOND_ROLL_CALL: {
        type: 'RESPOND_ROLL_CALL',
        memberId: 9,
        status: 'present',
        timestamp: '',
      },
      NOMINATE: {
        type: 'NOMINATE',
        position: 'Director',
        nomineeName: 'Member 2',
        nomineeId: 2,
        nominatedBy: 'Member 9',
        nominatorId: 9,
        nominationId: 1,
        timestamp: '',
      },
      OBJECT_TO_CONSENT: {
        type: 'OBJECT_TO_CONSENT',
        objector: 'Member 9',
        objectorId: 9,
        timestamp: '',
      },
      AGENDA_OBJECTION: { type: 'AGENDA_OBJECTION', objectorId: 9, timestamp: '' },
      WITHDRAW_MOTION: { type: 'WITHDRAW_MOTION', requesterId: 9, timestamp: '' },
      MODIFY_MOTION: { type: 'MODIFY_MOTION', requesterId: 9, newText: 'Resurface', timestamp: '' },
      CAST_PROXY_VOTE: {
        type: 'CAST_PROXY_VOTE',
        vote: 'yea',
        forMemberId: 2,
        castById: 9,
        timestamp: '',
      },
      REQUEST_PROXY: {
        type: 'REQUEST_PROXY',
        requestId: 1,
        requestedBy: 9,
        requestedByName: 'Member 9',
        requestedFor: 2,
        requestedForName: 'Member 2',
        scope: 'all',
        timestamp: '',
      },
      ACCEPT_PROXY: {
        type: 'ACCEPT_PROXY',
        requestId: 1,
        proxyId: 1,
        acceptedBy: 9,
        timestamp: '',
      },
      DECLINE_PROXY: { type: 'DECLINE_PROXY', requestId: 1, declinedBy: 9, timestamp: '' },
      CANCEL_PROXY_REQUEST: {
        type: 'CANCEL_PROXY_REQUEST',
        requestId: 1,
        canceledBy: 9,
        timestamp: '',
      },
    };

    it('are refused every action that takes part, whatever the socket says', () => {
      // A state in which each action would otherwise be in order
      const inOrder: MeetingState = {
        ...state,
        votingOpen: true,
        pendingSecond: null,
        unanimousConsentPending: true,
        nominationsOpen: true,
        currentNominationPosition: 'Director',
        allowProxyVoting: true,
        allowMemberProxyGrant: true,
        rollCall: { inProgress: true, responses: [] },
      };
      for (const action of Object.values(asGuest)) {
        expect(validateAction(inOrder, action), action.type).toMatchObject({
          valid: false,
          errorCode: 'PERMISSION_DENIED',
        });
      }
    });

    it('are tried for every action a guest may not send that names its sender', () => {
      const guarded = ACTION_TYPES.filter(
        (type) => !checkPermission('guest', type) && ACTOR_FIELDS[type].id,
      );
      expect(Object.keys(asGuest).sort()).toEqual(guarded.sort());
    });

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
