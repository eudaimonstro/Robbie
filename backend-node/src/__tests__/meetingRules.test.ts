import { describe, it, expect } from 'vitest';
import {
  act,
  inSession,
  move,
  moved,
  refusal,
  second,
  vote,
  ALL_YES,
} from './support/meetingPipeline.js';

describe('the meeting rules, through the server', () => {
  describe('precedence', () => {
    it('takes one main motion at a time and one amendment at a time (sim 10)', () => {
      let s = moved(inSession(), 'alice', 'mainMotion', 'Resurface the pool for $40,000', 'ben');
      expect(
        refusal(s, 'carl', {
          type: 'MAKE_MOTION',
          motionType: 'mainMotion',
          text: 'Repave the lot',
          motionId: 1,
        }),
      ).toMatchObject({
        errorCode: 'MOTION_PRECEDENCE_VIOLATION',
        error: 'One main motion at a time: settle the pending motion first',
      });
      s = moved(s, 'carl', 'amend', 'Strike "$40,000" and insert "$35,000"', 'eve', {
        textAmendment: { form: 'strikeInsert', strike: '$40,000', insert: '$35,000' },
      });
      expect(
        refusal(s, 'ben', {
          type: 'MAKE_MOTION',
          motionType: 'amend',
          text: 'Insert "this spring"',
          motionId: 1,
        }),
      ).toMatchObject({
        errorCode: 'MOTION_PRECEDENCE_VIOLATION',
        error: 'An amendment is pending: amend it, or decide it first',
      });
    });

    it('refuses the motions Robbie hides, from a phone and from the floor', () => {
      const s = moved(inSession(), 'alice', 'mainMotion', 'Hire a new landscaper', 'ben');
      expect(
        refusal(s, 'carl', {
          type: 'MAKE_MOTION',
          motionType: 'layOnTable',
          text: 'Table it',
          motionId: 1,
        }),
      ).toMatchObject({
        errorCode: 'MOTION_NOT_OFFERED',
        error:
          "Lay on the table isn't offered in Robbie: postpone the question to later in the meeting instead",
      });
      expect(
        refusal(s, 'dana', {
          type: 'MAKE_FLOOR_MOTION',
          motionType: 'objectionConsideration',
          text: 'I object',
          moverName: 'Frank',
          motionId: 1,
        }),
      ).toMatchObject({ errorCode: 'MOTION_NOT_OFFERED' });
    });
  });

  describe('a point of order', () => {
    it('is raised during a vote; the vote waits for the ruling, then closes on the motion', () => {
      let s = moved(inSession(), 'alice', 'mainMotion', 'Resurface the pool', 'ben');
      s = act(s, 'dana', { type: 'OPEN_VOTING', voteTimerEnd: null });
      s = act(s, 'carl', { type: 'CAST_VOTE', vote: 'yea', voterId: 0 });
      s = move(s, 'eve', 'pointOrder', 'Guests are voting');
      expect(s.currentMotion?.type).toBe('pointOrder');
      expect(s.votingOpen).toBe(true);
      // Nothing else until the chair rules
      for (const action of [
        { type: 'CAST_VOTE', vote: 'yea', voterId: 0 },
        { type: 'CLOSE_VOTING' },
      ] as const) {
        expect(refusal(s, action.type === 'CAST_VOTE' ? 'ben' : 'dana', action)).toMatchObject({
          errorCode: 'POINT_OF_ORDER_PENDING',
        });
      }
      s = act(s, 'dana', { type: 'CHAIR_RULING', ruling: 'overrule' });
      expect(s.currentMotion?.text).toBe('Resurface the pool');
      expect(s.votingOpen).toBe(true);
      s = act(s, 'ben', { type: 'CAST_VOTE', vote: 'yea', voterId: 0 });
      s = act(s, 'dana', { type: 'CLOSE_VOTING' });
      expect(s.completedMotions.at(-1)).toMatchObject({
        text: 'Resurface the pool',
        disposition: 'carried',
      });
    });

    it('is raised while a motion awaits a second, which waits for the ruling', () => {
      let s = move(inSession(), 'alice', 'mainMotion', 'Sue the developer');
      s = move(s, 'carl', 'pointOrder', 'That is not within our authority');
      expect(refusal(s, 'ben', { type: 'SECOND_MOTION' })).toMatchObject({
        errorCode: 'POINT_OF_ORDER_PENDING',
      });
      s = act(s, 'dana', { type: 'CHAIR_RULING', ruling: 'overrule' });
      s = second(s, 'ben');
      expect(s.currentMotion?.text).toBe('Sue the developer');
    });

    it('is the only thing a ruling settles: a motion is never ruled off the floor without a record (sim 14)', () => {
      const s = moved(inSession(), 'alice', 'mainMotion', 'Resurface the pool', 'ben');
      expect(refusal(s, 'dana', { type: 'CHAIR_RULING', ruling: 'sustain' })).toMatchObject({
        errorCode: 'INVALID_STATE',
      });
      // Decided by a vote instead
      expect(vote(s, ALL_YES).completedMotions).toHaveLength(1);
    });
  });
});

describe('unanimous consent', () => {
  it('ends when the chair opens a vote instead, so the next question is never adopted unasked (sim 8)', () => {
    let s = moved(inSession(), 'alice', 'mainMotion', 'Approve the pool contract', 'ben');
    s = act(s, 'dana', { type: 'REQUEST_UNANIMOUS_CONSENT' });
    expect(s.consentMotionId).toBe(s.currentMotion?.id);
    s = vote(s, ALL_YES);
    expect(s.unanimousConsentPending).toBe(false);
    s = moved(s, 'carl', 'mainMotion', 'Repave the parking lot', 'eve');
    expect(refusal(s, 'dana', { type: 'UNANIMOUS_CONSENT_PASSED' })).toMatchObject({
      errorCode: 'NO_CONSENT_PENDING',
    });
  });

  it('asked on an amendment, ends when the amendment is decided (sim 8b)', () => {
    let s = moved(inSession(), 'alice', 'mainMotion', 'Resurface the pool in May', 'ben');
    s = moved(s, 'carl', 'amend', 'Strike "May" and insert "June"', 'eve', {
      textAmendment: { form: 'strikeInsert', strike: 'May', insert: 'June' },
    });
    s = act(s, 'dana', { type: 'REQUEST_UNANIMOUS_CONSENT' });
    s = vote(s, ALL_YES);
    expect(s.currentMotion?.type).toBe('mainMotion');
    expect(s.unanimousConsentPending).toBe(false);
  });

  it('ends when a motion is made, which is as good as an objection', () => {
    let s = moved(inSession(), 'alice', 'mainMotion', 'Resurface the pool in May', 'ben');
    s = act(s, 'dana', { type: 'REQUEST_UNANIMOUS_CONSENT' });
    s = move(s, 'carl', 'amend', 'Strike "May" and insert "June"', {
      textAmendment: { form: 'strikeInsert', strike: 'May', insert: 'June' },
    });
    expect(s.unanimousConsentPending).toBe(false);
  });

  it("takes an objection from the floor, recorded by the chair in the objector's name (I1)", () => {
    let s = moved(inSession(), 'alice', 'mainMotion', 'Approve the pool contract', 'ben');
    s = act(s, 'dana', { type: 'REQUEST_UNANIMOUS_CONSENT' });
    expect(
      refusal(s, 'carl', {
        type: 'OBJECT_TO_CONSENT',
        fromFloor: true,
        floorObjector: 'Mrs. Ortiz',
      }),
    ).toMatchObject({ errorCode: 'PERMISSION_DENIED' });
    s = act(s, 'dana', {
      type: 'OBJECT_TO_CONSENT',
      fromFloor: true,
      floorObjector: 'Mrs. Ortiz',
    });
    expect(s.unanimousConsentPending).toBe(false);
    expect(s.meetingLog.at(-1)?.message).toBe('Mrs. Ortiz objects. The question is put to a vote.');
    // Without a name: a member in the room
    s = act(s, 'dana', { type: 'REQUEST_UNANIMOUS_CONSENT' });
    s = act(s, 'dana', { type: 'OBJECT_TO_CONSENT', fromFloor: true });
    expect(s.meetingLog.at(-1)?.message).toBe(
      'A member in the room objects. The question is put to a vote.',
    );
  });

  it('is not asked on an appeal, or while a motion waits for a second', () => {
    let s = moved(inSession(), 'alice', 'mainMotion', 'Approve the pool contract', 'ben');
    s = move(s, 'carl', 'amend', 'Insert "for $40,000" at the end', {
      textAmendment: { form: 'insert', insert: 'for $40,000' },
    });
    expect(refusal(s, 'dana', { type: 'REQUEST_UNANIMOUS_CONSENT' })).toMatchObject({
      errorCode: 'MOTION_PRECEDENCE_VIOLATION',
    });
    // An appeal from a ruling on a point of order
    s = act(s, 'dana', { type: 'DECLINE_SECOND' });
    s = move(s, 'eve', 'pointOrder', 'The contract was not in the packet');
    s = act(s, 'dana', { type: 'CHAIR_RULING', ruling: 'overrule' });
    s = moved(s, 'eve', 'appeal', 'I appeal from the decision of the chair', 'carl');
    expect(refusal(s, 'dana', { type: 'REQUEST_UNANIMOUS_CONSENT' })).toMatchObject({
      error: 'An appeal is decided by a vote',
    });
  });
});
