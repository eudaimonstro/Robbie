import { describe, it, expect } from 'vitest';
import { meetingReducer, initialState } from '../../reducer/index.js';
import { MOTIONS } from '../../constants/index.js';
import type { MeetingAction, MeetingState, Member, Motion } from '../../types/index.js';

const dana: Member = {
  id: 1,
  name: 'Dana Okafor',
  role: 'chair',
  present: true,
  presentBy: 'device',
};
const alice: Member = {
  id: 2,
  name: 'Alice Brennan',
  role: 'member',
  present: true,
  presentBy: 'device',
};
const carmen: Member = {
  id: 3,
  name: 'Carmen Diaz',
  role: 'member',
  present: true,
  presentBy: 'chair',
};
const ben: Member = {
  id: 4,
  name: 'Ben Whitaker',
  role: 'member',
  present: true,
  presentBy: 'device',
};

const inSession: MeetingState = {
  ...initialState,
  meetingActive: true,
  meetingStage: 'new-business',
  members: [dana, alice, carmen, ben],
};

const floorMotion = (
  fields: Partial<Extract<MeetingAction, { type: 'MAKE_FLOOR_MOTION' }>> = {},
): MeetingAction => ({
  type: 'MAKE_FLOOR_MOTION',
  motionType: 'mainMotion',
  text: 'Resurface the pool this spring',
  moverName: '',
  motionId: 7,
  recordedBy: dana.id,
  timestamp: '20:05',
  ...fields,
});

const lastLog = (state: MeetingState) => state.meetingLog.at(-1)?.message;

describe('business from the floor', () => {
  describe('MAKE_FLOOR_MOTION', () => {
    it('records a member in the room as the mover', () => {
      const state = meetingReducer(inSession, floorMotion({ moverMemberId: carmen.id }));

      expect(state.pendingSecond).toMatchObject({
        id: 7,
        type: 'mainMotion',
        text: 'Resurface the pool this spring',
        mover: 'Carmen Diaz',
        moverId: carmen.id,
        fromFloor: true,
        secondedBy: null,
      });
      expect(lastLog(state)).toBe(
        'Carmen Diaz moves from the floor: "Resurface the pool this spring" (Main Motion). Awaiting second.',
      );
    });

    it('records a typed name when the mover is not in the meeting', () => {
      const state = meetingReducer(inSession, floorMotion({ moverName: '  Frank Ruiz ' }));

      expect(state.pendingSecond).toMatchObject({
        mover: 'Frank Ruiz',
        moverId: 0,
        fromFloor: true,
      });
    });

    it('makes a motion that needs no second the pending question at once', () => {
      const state = meetingReducer(
        { ...inSession, currentMotion: question(), motionStack: [question()] },
        floorMotion({
          motionType: 'pointOrder',
          text: 'Speaker is off topic',
          moverName: 'Frank Ruiz',
        }),
      );

      expect(state.pendingSecond).toBeNull();
      expect(state.currentMotion).toMatchObject({
        type: 'pointOrder',
        mover: 'Frank Ruiz',
        fromFloor: true,
        status: 'active',
      });
      expect(lastLog(state)).toBe('Frank Ruiz raises Point of Order from the floor.');
    });
  });

  describe('SECOND_FROM_FLOOR', () => {
    const awaiting = meetingReducer(inSession, floorMotion({ moverMemberId: carmen.id }));
    const second = (
      fields: Partial<Extract<MeetingAction, { type: 'SECOND_FROM_FLOOR' }>> = {},
    ): MeetingState =>
      meetingReducer(awaiting, {
        type: 'SECOND_FROM_FLOOR',
        recordedBy: dana.id,
        timestamp: '20:06',
        ...fields,
      });

    it('seconds the motion for a member in the room without a name', () => {
      const state = second();

      expect(state.pendingSecond).toBeNull();
      expect(state.currentMotion).toMatchObject({
        id: 7,
        secondedBy: 'a member in the room',
        status: 'active',
      });
      expect(state.motionStack).toHaveLength(1);
      expect(lastLog(state)).toBe('Seconded from the floor.');
    });

    it('records the member named, or the name typed', () => {
      const named = second({ seconderMemberId: ben.id, seconderName: 'ignored' });
      expect(named.currentMotion?.secondedBy).toBe('Ben Whitaker');
      expect(lastLog(named)).toBe('Ben Whitaker seconds the motion from the floor.');

      expect(second({ seconderName: ' Frank Ruiz ' }).currentMotion?.secondedBy).toBe('Frank Ruiz');
      expect(second({ seconderName: '   ' }).currentMotion?.secondedBy).toBe(
        'a member in the room',
      );
    });

    it('does nothing with no motion awaiting a second', () => {
      const state = meetingReducer(inSession, {
        type: 'SECOND_FROM_FLOOR',
        recordedBy: dana.id,
        timestamp: '20:06',
      });
      expect(state).toBe(inSession);
    });
  });

  describe('NOMINATE from the floor', () => {
    it('records the nomination as from the floor, not by the chair', () => {
      const open = { ...inSession, nominationsOpen: true, currentNominationPosition: 'President' };
      const state = meetingReducer(open, {
        type: 'NOMINATE',
        position: 'President',
        nomineeName: 'Carmen Diaz',
        nomineeId: carmen.id,
        nominatedBy: 'Dana Okafor',
        nominatorId: dana.id,
        nominationId: 3,
        fromFloor: true,
        timestamp: '20:10',
      });

      expect(state.nominations).toEqual([
        {
          id: 3,
          position: 'President',
          nomineeName: 'Carmen Diaz',
          nomineeId: carmen.id,
          nominatedBy: 'From the floor',
          // Who entered it, for the record; the nomination is shown as from the floor
          nominatorId: dana.id,
          fromFloor: true,
          timestamp: '20:10',
          declined: false,
        },
      ]);
      expect(lastLog(state)).toBe('Nominated from the floor: Carmen Diaz for President.');
    });
  });

  describe('a question put by the chair', () => {
    it('has no mover and needs no second', () => {
      const state = meetingReducer(inSession, {
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: 'Approve: Pool hours',
        mover: 'Dana Okafor',
        moverId: dana.id,
        motionId: 8,
        putByChair: true,
        timestamp: '20:15',
      });

      expect(state.pendingSecond).toBeNull();
      expect(state.currentMotion).toMatchObject({
        id: 8,
        mover: 'Put by the chair',
        moverId: 0,
        putByChair: true,
        secondedBy: null,
        status: 'active',
      });
      expect(state.motionStack.map((m) => m.id)).toEqual([8]);
      expect(lastLog(state)).toBe(
        'The chair puts the question: "Approve: Pool hours" (Main Motion).',
      );
    });

    it('leaves a suspended second requirement for the next motion that needs it', () => {
      const suspended: MeetingState = {
        ...inSession,
        suspendedRules: [
          {
            id: 1,
            rule: 'second-requirement',
            purpose: 'Move quickly',
            specificAction: 'One motion without a second',
            scope: 'single-action',
            suspendedAt: '20:00',
            motionId: 1,
          },
        ],
      };
      const state = meetingReducer(suspended, {
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: 'Approve: Pool hours',
        mover: '',
        moverId: dana.id,
        motionId: 8,
        putByChair: true,
        timestamp: '20:15',
      });
      expect(state.currentMotion).toMatchObject({ id: 8, putByChair: true });
      expect(state.suspendedRules).toEqual(suspended.suspendedRules);
      expect(lastLog(state)).toBe(
        'The chair puts the question: "Approve: Pool hours" (Main Motion).',
      );
    });
  });

  describe('the first chance to speak', () => {
    const recognize = (state: MeetingState, member: Member) =>
      meetingReducer(
        { ...state, speakerQueue: [{ member, stance: 'pro' }] },
        {
          type: 'RECOGNIZE_SPEAKER',
          member,
          stance: 'pro',
          speakerTimerEnd: null,
          timestamp: '20:20',
        },
      );
    const pending = (motion: Motion) => ({
      ...inSession,
      currentMotion: motion,
      motionStack: [motion],
    });

    it('is not held for a mover who has no device to ask for the floor', () => {
      for (const motion of [
        question({ mover: 'Carmen Diaz', moverId: carmen.id, fromFloor: true }),
        question({ mover: 'Frank Ruiz', moverId: 0, fromFloor: true }),
        question({ mover: 'Put by the chair', moverId: 0, putByChair: true }),
      ]) {
        expect(recognize(pending(motion), ben).recognizedSpeaker, motion.mover).toEqual(ben);
      }
    });

    it('is held only for a mover who claims it by asking to speak (RONR 42:9)', () => {
      // Alice moved it and hasn't asked to speak: the chair recognizes Ben
      expect(recognize(pending(question()), ben).recognizedSpeaker).toEqual(ben);
      // Alice is waiting too: she speaks first
      const claimed = {
        ...pending(question()),
        speakerQueue: [
          { member: alice, stance: 'pro' as const },
          { member: ben, stance: 'con' as const },
        ],
      };
      const benFirst = meetingReducer(claimed, {
        type: 'RECOGNIZE_SPEAKER',
        member: ben,
        stance: 'con',
        speakerTimerEnd: null,
        timestamp: '20:20',
      });
      expect(benFirst.recognizedSpeaker).toBeNull();
      const aliceFirst = meetingReducer(claimed, {
        type: 'RECOGNIZE_SPEAKER',
        member: alice,
        stance: 'pro',
        speakerTimerEnd: null,
        timestamp: '20:20',
      });
      expect(aliceFirst.recognizedSpeaker).toEqual(alice);
    });
  });
});

/** A seconded main motion, moved by Alice on her phone */
function question(overrides: Partial<Motion> = {}): Motion {
  return {
    ...MOTIONS.mainMotion,
    id: 1,
    type: 'mainMotion',
    text: 'Paint the clubhouse',
    mover: 'Alice Brennan',
    moverId: alice.id,
    secondedBy: 'Ben Whitaker',
    status: 'active',
    moverHasSpoken: false,
    ...overrides,
  };
}
