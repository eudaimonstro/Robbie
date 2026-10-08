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
