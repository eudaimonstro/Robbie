import { describe, it, expect } from 'vitest';
import { initialState, meetingReducer } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingAction, MeetingState, Member, Motion } from '@robbie-bylawyer/shared/types';
import { validateAction } from '../socket/actionValidator.js';

const person = (id: number, name: string, fields: Partial<Member> = {}): Member => ({
  id,
  name,
  role: 'member',
  present: true,
  presentBy: 'device',
  ...fields,
});
const dana = person(1, 'Dana Okafor', { role: 'chair' });
const eve = person(5, 'Eve Park', { role: 'admin' });
const alice = person(2, 'Alice Brennan');
const carmen = person(3, 'Carmen Diaz', { presentBy: 'chair' });
const away = person(4, 'Ray Castillo', { present: false, presentBy: undefined });
const sam = person(9, 'Sam Guest', { role: 'guest' });

const inSession: MeetingState = {
  ...initialState,
  meetingActive: true,
  agendaAdopted: true,
  members: [dana, eve, alice, carmen, away, sam],
};

type FloorMotion = Extract<MeetingAction, { type: 'MAKE_FLOOR_MOTION' }>;
type FloorSecond = Extract<MeetingAction, { type: 'SECOND_FROM_FLOOR' }>;

const floorMotion = (fields: Partial<FloorMotion> = {}, state = inSession) =>
  validateAction(state, {
    type: 'MAKE_FLOOR_MOTION',
    motionType: 'mainMotion',
    text: 'Resurface the pool this spring',
    moverName: '',
    moverMemberId: carmen.id,
    motionId: 7,
    recordedBy: dana.id,
    timestamp: '',
    ...fields,
  });

const question = (fields: Partial<Motion> = {}): Motion => ({
  ...MOTIONS.mainMotion,
  id: 1,
  type: 'mainMotion',
  text: 'Paint the clubhouse',
  mover: 'Alice Brennan',
  moverId: alice.id,
  secondedBy: null,
  status: 'pending',
  ...fields,
});

describe('business from the floor', () => {
  describe('MAKE_FLOOR_MOTION', () => {
    it('records a motion by a member in the room, or by a typed name', () => {
      expect(floorMotion()).toEqual({ valid: true });
      expect(floorMotion({ moverMemberId: alice.id })).toEqual({ valid: true });
      expect(floorMotion({ moverMemberId: undefined, moverName: '  Frank Ruiz ' })).toEqual({
        valid: true,
      });
      // An admin presiding records it too
      expect(floorMotion({ recordedBy: eve.id })).toEqual({ valid: true });
    });

    it('is refused from someone who does not preside', () => {
      expect(floorMotion({ recordedBy: alice.id })).toEqual({
        valid: false,
        error: 'Only the chair records business from the floor',
        errorCode: 'PERMISSION_DENIED',
      });
    });

    it('needs a mover the meeting has present, who is not the chair or a guest', () => {
      expect(floorMotion({ moverMemberId: 99 })).toMatchObject({
        valid: false,
        errorCode: 'MEMBER_NOT_FOUND',
      });
      expect(floorMotion({ moverMemberId: away.id })).toMatchObject({
        valid: false,
        errorCode: 'NOT_PRESENT',
      });
      expect(floorMotion({ moverMemberId: sam.id })).toMatchObject({
        valid: false,
        errorCode: 'PERMISSION_DENIED',
      });
      for (const presiding of [dana, eve]) {
        // The chair, and the admin recording it while presiding
        expect(
          floorMotion({ moverMemberId: presiding.id, recordedBy: eve.id }),
          presiding.name,
        ).toEqual({
          valid: false,
          error: 'The chair does not move motions',
          errorCode: 'INVALID_ACTION',
        });
      }
    });

    it('needs a typed name, of at most 100 characters, when no member is named', () => {
      expect(floorMotion({ moverMemberId: undefined, moverName: '   ' })).toEqual({
        valid: false,
        error: 'Enter the name of the person who made the motion',
        errorCode: 'NAME_REQUIRED',
      });
      expect(floorMotion({ moverMemberId: undefined, moverName: 'x'.repeat(100) }).valid).toBe(
        true,
      );
      expect(floorMotion({ moverMemberId: undefined, moverName: 'x'.repeat(101) })).toEqual({
        valid: false,
        error: 'A name can be at most 100 characters',
        errorCode: 'INVALID_ACTION',
      });
    });

    it('is in order only when a member could make the same motion', () => {
      const pending = { ...inSession, pendingSecond: question() };
      expect(floorMotion({}, pending)).toMatchObject({
        valid: false,
        errorCode: 'MOTION_PRECEDENCE_VIOLATION',
      });

      // An amendment while a motion to adjourn, which ranks above it, is pending
      const active = question({ status: 'active', secondedBy: 'Carmen Diaz' });
      const adjourn = question({ ...MOTIONS.adjourn, id: 2, type: 'adjourn', status: 'active' });
      const debating = { ...inSession, currentMotion: adjourn, motionStack: [active, adjourn] };
      expect(floorMotion({ motionType: 'amend' }, debating)).toMatchObject({
        valid: false,
        errorCode: 'MOTION_PRECEDENCE_VIOLATION',
      });
      expect(floorMotion({}, { ...debating, votingOpen: true })).toMatchObject({
        valid: false,
        errorCode: 'VOTING_IN_PROGRESS',
      });
      expect(floorMotion({}, { ...inSession, meetingActive: false })).toMatchObject({
        valid: false,
        errorCode: 'MEETING_NOT_ACTIVE',
      });
      expect(floorMotion({ motionType: 'notAMotion' })).toMatchObject({
        valid: false,
        errorCode: 'UNKNOWN_MOTION_TYPE',
      });
      // A motion Robbie doesn't offer
      expect(floorMotion({ motionType: 'takeFromTable', tabledMotionId: 42 })).toMatchObject({
        valid: false,
        errorCode: 'MOTION_NOT_OFFERED',
      });
      // Renewing a motion defeated this meeting
      const defeated = {
        ...inSession,
        defeatedMotions: [
          { type: 'mainMotion', text: 'Resurface the pool this spring', timestamp: '' },
        ],
      };
      expect(floorMotion({}, defeated)).toMatchObject({
        valid: false,
        errorCode: 'MOTION_RENEWAL_BLOCKED',
      });
    });
  });

  describe('SECOND_FROM_FLOOR', () => {
    const awaiting = { ...inSession, pendingSecond: question() };
    const second = (fields: Partial<FloorSecond> = {}, state: MeetingState = awaiting) =>
      validateAction(state, {
        type: 'SECOND_FROM_FLOOR',
        recordedBy: dana.id,
        timestamp: '',
        ...fields,
      });

    it('seconds for someone named, typed or unnamed', () => {
      expect(second()).toEqual({ valid: true });
      expect(second({ seconderMemberId: carmen.id })).toEqual({ valid: true });
      expect(second({ seconderName: 'Frank Ruiz' })).toEqual({ valid: true });
      expect(second({ seconderName: '' })).toEqual({ valid: true });
    });

    it('is refused from someone who does not preside', () => {
      expect(second({ recordedBy: alice.id })).toMatchObject({
        valid: false,
        errorCode: 'PERMISSION_DENIED',
      });
    });

    it('needs a motion awaiting a second', () => {
      expect(second({}, inSession)).toMatchObject({
        valid: false,
        errorCode: 'NO_PENDING_SECOND',
      });
    });

    it('refuses the mover seconding their own motion, unless that rule is suspended', () => {
      expect(second({ seconderMemberId: alice.id })).toEqual({
        valid: false,
        error: 'The mover cannot second their own motion',
        errorCode: 'INVALID_ACTION',
      });
      const suspended: MeetingState = {
        ...awaiting,
        suspendedRules: [
          {
            id: 1,
            rule: 'mover-cannot-second',
            purpose: '',
            specificAction: '',
            scope: 'meeting-remainder',
            suspendedAt: '',
            motionId: 1,
          },
        ],
      };
      expect(second({ seconderMemberId: alice.id }, suspended)).toEqual({ valid: true });
    });

    it('needs a seconder the meeting has present, who is not the chair or a guest', () => {
      expect(second({ seconderMemberId: 99 })).toMatchObject({ errorCode: 'MEMBER_NOT_FOUND' });
      expect(second({ seconderMemberId: away.id })).toMatchObject({ errorCode: 'NOT_PRESENT' });
      expect(second({ seconderMemberId: sam.id })).toMatchObject({
        errorCode: 'PERMISSION_DENIED',
      });
      expect(second({ seconderMemberId: dana.id })).toEqual({
        valid: false,
        error: 'The chair does not second motions',
        errorCode: 'INVALID_ACTION',
      });
      expect(second({ seconderName: 'x'.repeat(101) })).toMatchObject({
        errorCode: 'INVALID_ACTION',
      });
    });
  });

  describe('NOMINATE from the floor', () => {
    const open = { ...inSession, nominationsOpen: true, currentNominationPosition: 'President' };
    const nominate = (nominatorId: number) =>
      validateAction(open, {
        type: 'NOMINATE',
        position: 'President',
        nomineeName: 'Carmen Diaz',
        nomineeId: carmen.id,
        nominatedBy: '',
        nominatorId,
        nominationId: 1,
        fromFloor: true,
        timestamp: '',
      });

    it('is recorded by the chair, not sent by a member', () => {
      expect(nominate(dana.id)).toEqual({ valid: true });
      expect(nominate(eve.id)).toEqual({ valid: true });
      expect(nominate(alice.id)).toEqual({
        valid: false,
        error: 'Only the chair records a nomination from the floor',
        errorCode: 'PERMISSION_DENIED',
      });
    });
  });

  describe('a question put by the chair', () => {
    const put = (moverId: number, motionType = 'mainMotion') =>
      validateAction(inSession, {
        type: 'MAKE_MOTION',
        motionType,
        text: 'Approve: Pool hours',
        mover: '',
        moverId,
        motionId: 1,
        putByChair: true,
        timestamp: '',
      });

    it('is a main question: any other motion has a mover', () => {
      for (const motionType of ['adjourn', 'suspendRules', 'bylawAmendment', 'adoptAgenda']) {
        expect(put(dana.id, motionType), motionType).toEqual({
          valid: false,
          error: 'Only a main question is put by the chair',
          errorCode: 'INVALID_ACTION',
        });
      }
    });

    it('is put by the chair, not by a member', () => {
      expect(put(dana.id)).toEqual({ valid: true });
      expect(put(alice.id)).toEqual({
        valid: false,
        error: 'Only the chair puts a question to the meeting',
        errorCode: 'PERMISSION_DENIED',
      });
    });

    it('goes to a vote without a second', () => {
      const put: MeetingAction = {
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: 'Approve: Pool hours',
        mover: '',
        moverId: dana.id,
        motionId: 1,
        putByChair: true,
        timestamp: '',
      };
      expect(validateAction(inSession, put)).toEqual({ valid: true });
      const pending = meetingReducer(inSession, put);
      expect(
        validateAction(pending, { type: 'OPEN_VOTING', voteTimerEnd: null, timestamp: '' }),
      ).toEqual({ valid: true });
      // Nothing awaits a second, from the floor or from a phone
      expect(
        validateAction(pending, { type: 'SECOND_FROM_FLOOR', recordedBy: dana.id, timestamp: '' }),
      ).toMatchObject({ valid: false, errorCode: 'NO_PENDING_SECOND' });
      expect(
        validateAction(pending, {
          type: 'SECOND_MOTION',
          seconder: 'Alice Brennan',
          seconderId: alice.id,
          timestamp: '',
        }),
      ).toMatchObject({ valid: false, errorCode: 'NO_PENDING_SECOND' });
    });
  });

  describe('the first chance to speak', () => {
    const recognize = (motion: Motion) =>
      validateAction(
        {
          ...inSession,
          currentMotion: motion,
          motionStack: [motion],
          speakerQueue: [{ member: alice, stance: 'pro' }],
        },
        {
          type: 'RECOGNIZE_SPEAKER',
          member: alice,
          stance: 'pro',
          speakerTimerEnd: null,
          timestamp: '',
        },
      );
    const active = { status: 'active' as const, secondedBy: 'Frank Ruiz' };

    it('is not held for a mover with no device to ask for the floor', () => {
      expect(
        recognize(
          question({ ...active, mover: 'Carmen Diaz', moverId: carmen.id, fromFloor: true }),
        ),
      ).toEqual({ valid: true });
      expect(recognize(question({ ...active, mover: 'Put by the chair', moverId: 0 }))).toEqual({
        valid: true,
      });
    });

    it('is held for a mover on a device', () => {
      const ben = person(6, 'Ben Whitaker');
      expect(
        recognize(question({ ...active, mover: 'Ben Whitaker', moverId: ben.id })),
      ).toMatchObject({ valid: false, errorCode: 'MOVER_SPEAKS_FIRST' });
    });
  });

  describe('motions during an election', () => {
    const elections: Array<[string, Partial<MeetingState>]> = [
      ['nominations open', { nominationsOpen: true, currentNominationPosition: 'Treasurer' }],
      ['nominations closed', { nominationsOpen: false, currentNominationPosition: 'Treasurer' }],
      [
        'a ballot',
        {
          currentElection: {
            id: 1,
            position: 'Treasurer',
            candidates: [{ name: 'Alice Brennan', id: alice.id }],
            requiredVotes: 'majority',
            votingInProgress: true,
            ballotResults: { 'Alice Brennan': 0 },
            votersWhoVoted: [],
            elected: null,
          },
        },
      ],
    ];
    const move = (state: MeetingState, motionType: string) =>
      validateAction(state, {
        type: 'MAKE_MOTION',
        motionType,
        text: 'Resurface the pool',
        mover: 'Alice Brennan',
        moverId: alice.id,
        motionId: 1,
        timestamp: '',
      });

    it.each(elections)('waits for the election to end: %s', (_, election) => {
      const electing = { ...inSession, ...election };
      const refused = {
        valid: false,
        error: 'Finish or set aside the election first',
        errorCode: 'ELECTION_IN_PROGRESS',
      };
      for (const motionType of ['mainMotion', 'bylawAmendment', 'amend', 'previousQuestion']) {
        expect(move(electing, motionType), motionType).toEqual(refused);
      }
      expect(floorMotion({}, electing)).toEqual(refused);
    });

    it.each(elections)('allows privileged and incidental motions: %s', (_, election) => {
      const electing = { ...inSession, ...election };
      for (const motionType of ['adjourn', 'recess', 'pointOrder']) {
        expect(move(electing, motionType), motionType).toEqual({ valid: true });
      }
      expect(floorMotion({ motionType: 'adjourn' }, electing)).toEqual({ valid: true });
    });
  });
});
