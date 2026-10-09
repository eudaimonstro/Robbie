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

  describe('DECLINE_NOMINATION', () => {
    const nominated = {
      ...state,
      nominations: [
        {
          id: 7,
          position: 'Director',
          nomineeName: 'Member 2',
          nomineeId: 2,
          nominatedBy: 'Member 3',
          nominatorId: 3,
          timestamp: '',
          declined: false,
        },
      ],
    };
    const decline = (declinedBy: number) =>
      validateAction(nominated, {
        type: 'DECLINE_NOMINATION',
        nominationId: 7,
        declinedBy,
        timestamp: '',
      });

    it('is for the nominee, or the chair on their behalf', () => {
      expect(decline(2).valid).toBe(true);
      expect(decline(1).valid).toBe(true);
      expect(decline(3)).toMatchObject({ valid: false, errorCode: 'PERMISSION_DENIED' });
    });
  });

  describe('SET_MEMBER_ROLE', () => {
    const handTo = (target: Member) =>
      validateAction(
        { ...state, members: [chair, target] },
        { type: 'SET_MEMBER_ROLE', targetMemberId: target.id, newRole: 'chair', timestamp: '' },
      );

    it('hands the chair to a member present on a device', () => {
      expect(handTo(speaker).valid).toBe(true);
      // States saved before presentBy existed: a present member was on a device
      const { presentBy: _presentBy, ...older } = speaker;
      expect(handTo(older).valid).toBe(true);
    });

    it('refuses a member in the room without a device, or not present', () => {
      const refused = {
        valid: false,
        errorCode: 'NOT_PRESENT',
        error: 'The new chair needs to be present on a device',
      };
      expect(handTo({ ...speaker, presentBy: 'chair' })).toMatchObject(refused);
      const { presentBy: _presentBy, ...rest } = speaker;
      expect(handTo({ ...rest, present: false })).toMatchObject(refused);
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
      // A presiding socket whose member the meeting now has as a guest, recording the floor
      MAKE_FLOOR_MOTION: {
        type: 'MAKE_FLOOR_MOTION',
        motionType: 'mainMotion',
        text: 'Resurface the pool',
        moverName: 'Frank Ruiz',
        motionId: 1,
        recordedBy: 9,
        timestamp: '',
      },
      SECOND_FROM_FLOOR: { type: 'SECOND_FROM_FLOOR', recordedBy: 9, timestamp: '' },
      CAST_BALLOT: { type: 'CAST_BALLOT', candidateName: 'Ann', voterId: 9 },
      DECLINE_NOMINATION: {
        type: 'DECLINE_NOMINATION',
        nominationId: 1,
        declinedBy: 9,
        timestamp: '',
      },
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
      REQUEST_DIVISION: { type: 'REQUEST_DIVISION', requesterId: 9, timestamp: '' },
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
