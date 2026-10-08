import { describe, it, expect } from 'vitest';
import {
  act,
  inSession,
  minutesOf,
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

describe('what each motion does when it carries', () => {
  const pool = () =>
    moved(inSession(), 'alice', 'mainMotion', 'Resurface the pool for $40,000', 'ben');
  const amendTo35 = {
    textAmendment: { form: 'strikeInsert', strike: '$40,000', insert: '$35,000' },
  } as const;

  it('an amendment rewrites the motion, which is voted, stamped and minuted as amended (sim 1)', () => {
    let s = moved(pool(), 'carl', 'amend', 'ignored: worded from the change', 'eve', amendTo35);
    expect(s.currentMotion?.text).toBe('Strike “$40,000” and insert “$35,000”');
    s = vote(s, ALL_YES);
    expect(s.currentMotion).toMatchObject({
      type: 'mainMotion',
      text: 'Resurface the pool for $35,000',
      originalText: 'Resurface the pool for $40,000',
    });
    s = act(s, 'dana', { type: 'OPEN_VOTING', voteTimerEnd: null });
    expect(s.meetingLog.at(-1)?.message).toBe(
      'Chair puts the question: "Resurface the pool for $35,000"',
    );
    s = act(s, 'dana', { type: 'CLOSE_VOTING' });
    expect(s.completedMotions.at(-1)).toMatchObject({
      text: 'Resurface the pool for $35,000',
      originalText: 'Resurface the pool for $40,000',
      disposition: 'failed',
    });
    const minutes = minutesOf(s);
    expect(minutes).toContain(
      '**Amend.** Carl Moss moved: "Strike “$40,000” and insert “$35,000”." Seconded by Eve Park. Carried, 5 to 0. A quorum was present.',
    );
    expect(minutes).toContain(
      '**Main motion.** Alice Brennan moved: "Resurface the pool for $40,000." Seconded by Ben Whitaker. As amended: "Resurface the pool for $35,000." Failed.',
    );
  });

  it('a secondary amendment changes the words the primary amendment inserts', () => {
    let s = moved(pool(), 'carl', 'amend', '', 'eve', amendTo35);
    s = moved(s, 'ben', 'amendAmendment', '', 'alice', {
      textAmendment: { form: 'strikeInsert', strike: '$35,000', insert: '$38,000' },
    });
    s = vote(s, ALL_YES);
    expect(s.currentMotion?.text).toBe('Strike “$40,000” and insert “$38,000”');
    s = vote(s, ALL_YES);
    expect(s.currentMotion?.text).toBe('Resurface the pool for $38,000');
  });

  it('an amendment that fails changes nothing', () => {
    let s = moved(pool(), 'carl', 'amend', '', 'eve', amendTo35);
    s = vote(s, { pat: 'nay', alice: 'nay', ben: 'nay', carl: 'yea' });
    expect(s.currentMotion?.text).toBe('Resurface the pool for $40,000');
    expect(s.currentMotion?.originalText).toBeUndefined();
  });

  it('an amendment says what it changes, in words the motion has, exactly once', () => {
    const s = pool();
    const amend = (textAmendment: unknown) =>
      refusal(s, 'carl', {
        type: 'MAKE_MOTION',
        motionType: 'amend',
        text: 'x',
        motionId: 1,
        textAmendment,
      });
    expect(amend(undefined)?.error).toBe(
      'Say what the amendment changes: words to insert, strike or replace',
    );
    expect(amend({ form: 'strike', strike: '$50,000' })?.error).toBe(
      '"$50,000" is not in the words being amended',
    );
    expect(amend({ form: 'insert', insert: 'this spring' })).toBeNull();
  });

  it('postponing to the next meeting takes the motion off the floor, for the next agenda (sim 2)', () => {
    let s = moved(pool(), 'carl', 'postponeDefinite', '', 'eve', {
      postponeTo: { kind: 'next-meeting' },
    });
    expect(s.currentMotion?.text).toBe('Postpone it to the next meeting');
    s = vote(s, ALL_YES);
    expect(s.currentMotion).toBeNull();
    expect(s.motionStack).toEqual([]);
    expect(s.completedMotions.at(-1)).toMatchObject({
      text: 'Resurface the pool for $40,000',
      disposition: 'postponed',
      postponedTo: { kind: 'next-meeting' },
    });
    const minutes = minutesOf(s);
    expect(minutes).toContain(
      '**Main motion.** Alice Brennan moved: "Resurface the pool for $40,000." Seconded by Ben Whitaker. Postponed to the next meeting.',
    );
    expect(minutes).toContain(
      '## Postponed to the next meeting\n\n- "Resurface the pool for $40,000." (Main motion, moved by Alice Brennan)',
    );
  });

  it('postponing to later in the meeting sets the question aside with its amendment, for the chair to take up', () => {
    let s = moved(pool(), 'carl', 'amend', '', 'eve', amendTo35);
    s = moved(s, 'ben', 'postponeDefinite', '', 'alice', {
      postponeTo: { kind: 'later', when: 'after the treasurer’s report' },
    });
    s = vote(s, ALL_YES);
    expect(s.motionStack).toEqual([]);
    expect(s.postponedMotions?.[0].motions.map((m) => m.type)).toEqual(['mainMotion', 'amend']);
    expect(s.completedMotions.at(-1)).toMatchObject({
      disposition: 'postponed',
      pendingAmendments: ['Strike “$40,000” and insert “$35,000”'],
    });
    const mainId = s.postponedMotions![0].motions[0].id;
    s = act(s, 'dana', { type: 'TAKE_UP_POSTPONED', motionId: mainId });
    expect(s.currentMotion?.type).toBe('amend');
    expect(s.motionStack.map((m) => m.type)).toEqual(['mainMotion', 'amend']);
    expect(s.postponedMotions).toEqual([]);
  });

  it('a question postponed to later and never taken up is unfinished at the adjournment', () => {
    let s = moved(pool(), 'carl', 'postponeDefinite', '', 'eve', {
      postponeTo: { kind: 'later', when: '8:30 PM' },
    });
    s = vote(s, ALL_YES);
    s = act(s, 'dana', { type: 'END_MEETING' });
    expect(s.unfinishedAtAdjournment).toEqual([
      expect.objectContaining({ text: 'Resurface the pool for $40,000', postponed: true }),
    ]);
  });

  it('postponing indefinitely kills the motion (sim 3)', () => {
    let s = moved(
      pool(),
      'carl',
      'postponeIndefinitely',
      'I move to postpone it indefinitely',
      'eve',
    );
    s = vote(s, ALL_YES);
    expect(s.currentMotion).toBeNull();
    expect(minutesOf(s)).toContain('Seconded by Ben Whitaker. Postponed indefinitely.');
  });

  it('referring sends the motion and its pending amendment to the committee (sim 4)', () => {
    let s = moved(pool(), 'carl', 'amend', '', 'eve', amendTo35);
    s = moved(s, 'ben', 'referCommittee', '', 'alice', { referTo: 'the landscaping committee' });
    expect(s.currentMotion?.text).toBe('Refer it to the landscaping committee');
    s = vote(s, ALL_YES);
    expect(s.motionStack).toEqual([]);
    expect(minutesOf(s)).toContain(
      'Referred to the landscaping committee, with the amendment "Strike “$40,000” and insert “$35,000”" pending.',
    );
  });

  it('closing debate puts the question at once: no more hands, no amendments (sim 6)', () => {
    let s = moved(pool(), 'carl', 'previousQuestion', 'I move the previous question', 'eve');
    s = vote(s, ALL_YES);
    expect(s.currentMotion).toMatchObject({ type: 'mainMotion', debateClosed: true });
    expect(refusal(s, 'ben', { type: 'RAISE_HAND', stance: 'con' })).toMatchObject({
      errorCode: 'DEBATE_CLOSED',
    });
    expect(
      refusal(s, 'ben', {
        type: 'MAKE_MOTION',
        motionType: 'amend',
        text: 'x',
        motionId: 1,
        textAmendment: { form: 'insert', insert: 'now' },
      }),
    ).toMatchObject({ errorCode: 'DEBATE_CLOSED' });
    // Adjourning is still in order, and the question is voted
    expect(vote(s, ALL_YES).completedMotions.at(-1)).toMatchObject({ disposition: 'carried' });
  });

  it('adjourning ends the meeting with business pending, which is recorded unfinished (sim 7)', () => {
    let s = moved(pool(), 'carl', 'adjourn', 'I move that we adjourn', 'eve');
    s = vote(s, ALL_YES);
    expect(s.adjournmentCarried).toBe(true);
    expect(s.meetingActive).toBe(true);
    // Only the chair's declaring it is in order now
    expect(refusal(s, 'dana', { type: 'OPEN_VOTING', voteTimerEnd: null })).toMatchObject({
      errorCode: 'ADJOURNMENT_CARRIED',
    });
    s = act(s, 'dana', { type: 'END_MEETING' });
    expect(s.meetingStage).toBe('adjourned');
    expect(s.unfinishedAtAdjournment).toEqual([
      expect.objectContaining({ kind: 'motion', text: 'Resurface the pool for $40,000' }),
    ]);
    expect(s.completedMotions.at(-1)).toMatchObject({
      type: 'adjourn',
      disposition: 'carried',
      reconsiderable: false,
    });
  });

  it('a recess holds the meeting until the chair resumes it, with the business where it was (sim 16)', () => {
    let s = moved(pool(), 'carl', 'recess', '', 'eve', { recessUntil: '8:15 PM' });
    expect(s.currentMotion?.text).toBe('Recess until 8:15 PM');
    s = vote(s, ALL_YES);
    expect(s.recess).toMatchObject({ until: '8:15 PM' });
    expect(
      refusal(s, 'ben', { type: 'MAKE_MOTION', motionType: 'pointOrder', text: 'x', motionId: 1 }),
    ).toMatchObject({
      errorCode: 'IN_RECESS',
    });
    expect(refusal(s, 'dana', { type: 'OPEN_VOTING', voteTimerEnd: null })).toMatchObject({
      errorCode: 'IN_RECESS',
    });
    s = act(s, 'dana', { type: 'RESUME_MEETING' });
    expect(s.recess).toBeNull();
    expect(s.currentMotion?.text).toBe('Resurface the pool for $40,000');
    expect(minutesOf(s)).toMatch(
      /The meeting recessed at \d+:\d\d [AP]M and resumed at \d+:\d\d [AP]M\./,
    );
  });
});

describe('a point of order ruled well taken', () => {
  const amendment = () => {
    const s = moved(inSession(), 'alice', 'mainMotion', 'Resurface the pool', 'ben');
    return moved(s, 'carl', 'amend', '', 'eve', {
      textAmendment: { form: 'insert', insert: 'and fire the management company' },
    });
  };

  it('rules a motion out of order, which leaves the floor with a record (sim 13)', () => {
    let s = move(amendment(), 'ben', 'pointOrder', 'The amendment is not germane');
    s = act(s, 'dana', { type: 'CHAIR_RULING', ruling: 'sustain', outOfOrder: true });
    expect(s.currentMotion?.text).toBe('Resurface the pool');
    expect(s.completedMotions.at(-1)).toMatchObject({ type: 'amend', disposition: 'out-of-order' });
    const minutes = minutesOf(s);
    expect(minutes).toContain(
      '**Point of order.** Ben Whitaker raised a point of order: "The amendment is not germane." The chair ruled: The point is well taken; the motion is out of order.',
    );
    expect(minutes).toContain('Seconded by Eve Park. Ruled out of order by the chair.');
    // The ruling comes first
    expect(minutes.indexOf('**Point of order.**')).toBeLessThan(minutes.indexOf('**Amend.**'));
  });

  it('rules out of order a motion awaiting a second', () => {
    let s = move(inSession(), 'alice', 'mainMotion', 'Sue the board members personally');
    s = move(s, 'carl', 'pointOrder', 'That is against the bylaws');
    s = act(s, 'dana', { type: 'CHAIR_RULING', ruling: 'sustain', outOfOrder: true });
    expect(s.pendingSecond).toBeNull();
    expect(s.completedMotions.at(-1)).toMatchObject({ disposition: 'out-of-order' });
  });

  it('rules out of order the motion being voted on, which ends the vote undecided', () => {
    let s = moved(inSession(), 'alice', 'mainMotion', 'Spend the reserves on a party', 'ben');
    s = act(s, 'dana', { type: 'OPEN_VOTING', voteTimerEnd: null });
    s = act(s, 'carl', { type: 'CAST_VOTE', vote: 'yea', voterId: 0 });
    s = move(s, 'eve', 'pointOrder', 'Reserves can only be spent on repairs');
    s = act(s, 'dana', { type: 'CHAIR_RULING', ruling: 'sustain', outOfOrder: true });
    expect(s.votingOpen).toBe(false);
    expect(s.voterChoices).toEqual({});
    expect(s.currentMotion).toBeNull();
  });

  it('is not used to rule out of order with nothing it is about, or when not well taken', () => {
    const s = move(inSession(), 'ben', 'pointOrder', 'Guests are voting');
    expect(
      refusal(s, 'dana', { type: 'CHAIR_RULING', ruling: 'sustain', outOfOrder: true }),
    ).toMatchObject({ errorCode: 'INVALID_ACTION' });
    const t = move(amendment(), 'ben', 'pointOrder', 'Not germane');
    expect(
      refusal(t, 'dana', { type: 'CHAIR_RULING', ruling: 'overrule', outOfOrder: true }),
    ).toMatchObject({ errorCode: 'INVALID_ACTION' });
  });

  it('is appealed: reversed, the motion ruled out of order is pending again, and the minutes say so', () => {
    let s = move(amendment(), 'ben', 'pointOrder', 'The amendment is not germane');
    s = act(s, 'dana', { type: 'CHAIR_RULING', ruling: 'sustain', outOfOrder: true });
    s = moved(s, 'carl', 'appeal', 'I appeal from the decision of the chair', 'eve');
    s = vote(s, { pat: 'nay', alice: 'nay', ben: 'yea', carl: 'nay', eve: 'nay' });
    expect(s.currentMotion).toMatchObject({ type: 'amend' });
    expect(s.lastChairRuling).toBeNull();
    expect(minutesOf(s)).toContain(
      '**Appeal the chair\'s ruling.** Carl Moss moved: "I appeal from the decision of the chair." Seconded by Eve Park. The chair\'s decision was overturned, 1 to 4.',
    );
  });

  it('is appealed: sustained by a tie, the ruling stands', () => {
    let s = move(amendment(), 'ben', 'pointOrder', 'The amendment is not germane');
    s = act(s, 'dana', { type: 'CHAIR_RULING', ruling: 'sustain', outOfOrder: true });
    s = moved(s, 'carl', 'appeal', 'I appeal from the decision of the chair', 'eve');
    s = vote(s, { pat: 'yea', alice: 'yea', carl: 'nay', eve: 'nay' });
    expect(s.currentMotion?.type).toBe('mainMotion');
  });
});

describe('withdrawing a motion', () => {
  it('awaiting a second, the mover withdraws it at once', () => {
    let s = move(inSession(), 'alice', 'mainMotion', 'Paint the clubhouse purple');
    expect(refusal(s, 'ben', { type: 'WITHDRAW_MOTION' })).toMatchObject({
      errorCode: 'NOT_MOTION_MAKER',
    });
    s = act(s, 'alice', { type: 'WITHDRAW_MOTION' });
    expect(s.pendingSecond).toBeNull();
    expect(minutesOf(s)).toContain('Paint the clubhouse purple." Withdrawn by the mover.');
  });

  it('once stated, the mover asks and the chair grants it without objection', () => {
    let s = moved(inSession(), 'alice', 'mainMotion', 'Paint the clubhouse purple', 'ben');
    s = act(s, 'alice', { type: 'WITHDRAW_MOTION', motionId: 1 });
    expect(s.currentMotion).toMatchObject({
      type: 'withdrawMotion',
      text: 'Permission to withdraw "Paint the clubhouse purple"',
    });
    s = act(s, 'dana', { type: 'REQUEST_UNANIMOUS_CONSENT' });
    s = act(s, 'dana', { type: 'UNANIMOUS_CONSENT_PASSED' });
    expect(s.motionStack).toEqual([]);
    // The request leaves no record of its own; the motion's says how it went
    expect(s.completedMotions.map((m) => [m.type, m.disposition])).toEqual([
      ['mainMotion', 'withdrawn'],
    ]);
    expect(minutesOf(s)).toContain(
      "Seconded by Ben Whitaker. Withdrawn by the mover, with the meeting's permission.",
    );
  });

  it('once stated, a vote can refuse it, and the motion stays', () => {
    let s = moved(inSession(), 'alice', 'mainMotion', 'Paint the clubhouse purple', 'ben');
    s = act(s, 'alice', { type: 'WITHDRAW_MOTION', motionId: 1 });
    s = vote(s, { pat: 'nay', ben: 'nay', carl: 'nay', eve: 'yea' });
    expect(s.currentMotion?.text).toBe('Paint the clubhouse purple');
    expect(s.completedMotions).toEqual([]);
  });

  it('is recorded by the chair for a mover in the room, even one recorded by a typed name (sim 9b)', () => {
    let s = act(inSession(), 'dana', {
      type: 'MAKE_FLOOR_MOTION',
      motionType: 'mainMotion',
      text: 'Ban leaf blowers',
      moverName: 'Mrs. Ortiz',
      motionId: 1,
    });
    s = act(s, 'dana', { type: 'SECOND_FROM_FLOOR' });
    expect(
      refusal(s, 'carl', { type: 'WITHDRAW_MOTION', fromFloor: true, motionId: 1 }),
    ).toMatchObject({
      errorCode: 'PERMISSION_DENIED',
    });
    s = act(s, 'dana', { type: 'WITHDRAW_MOTION', fromFloor: true, motionId: 1 });
    expect(s.currentMotion?.type).toBe('withdrawMotion');
    s = act(s, 'dana', { type: 'REQUEST_UNANIMOUS_CONSENT' });
    s = act(s, 'dana', { type: 'UNANIMOUS_CONSENT_PASSED' });
    expect(s.completedMotions.at(-1)).toMatchObject({
      text: 'Ban leaf blowers',
      disposition: 'withdrawn',
    });
  });
});

describe('a division of the assembly', () => {
  const voiceVote = () => {
    let s = moved(inSession(), 'alice', 'mainMotion', 'Buy a new grill', 'ben');
    s = act(s, 'dana', { type: 'SET_VOTING_METHOD', method: 'voice' });
    return act(s, 'dana', { type: 'OPEN_VOTING', voteTimerEnd: null });
  };

  it('turns a voice vote into a counted vote, on devices and in the room, and the minutes say so', () => {
    let s = act(voiceVote(), 'dana', { type: 'SET_FLOOR_TALLY', yea: 9, nay: 8, abstain: 0 });
    expect(refusal(s, 'carl', { type: 'CAST_VOTE', vote: 'nay', voterId: 0 })).toMatchObject({
      errorCode: 'VOTING_METHOD',
    });
    s = act(s, 'carl', { type: 'REQUEST_DIVISION' });
    expect(s.votingMethod).toBe('standard');
    expect(s.floorVotes).toEqual({ yea: 0, nay: 0, abstain: 0 });
    expect(s.meetingLog.at(-1)?.message).toBe(
      'Carl Moss calls for a division: the vote is counted.',
    );
    s = act(s, 'carl', { type: 'CAST_VOTE', vote: 'nay', voterId: 0 });
    s = act(s, 'alice', { type: 'CAST_VOTE', vote: 'yea', voterId: 0 });
    s = act(s, 'dana', { type: 'SET_FLOOR_TALLY', yea: 6, nay: 9, abstain: 0 });
    s = act(s, 'dana', { type: 'CLOSE_VOTING' });
    expect(s.completedMotions.at(-1)).toMatchObject({ division: true, disposition: 'failed' });
    expect(minutesOf(s)).toContain(
      'Failed on a division, on devices 1 to 1 and in the room 6 to 9: 7 to 10.',
    );
  });

  it('is recorded by the chair for someone in the room, and only on an open voice vote', () => {
    const s = voiceVote();
    expect(refusal(s, 'carl', { type: 'REQUEST_DIVISION', fromFloor: true })).toMatchObject({
      errorCode: 'PERMISSION_DENIED',
    });
    expect(
      act(s, 'dana', { type: 'REQUEST_DIVISION', fromFloor: true }).meetingLog.at(-1)?.message,
    ).toBe('A member in the room calls for a division: the vote is counted.');
    const counted = moved(inSession(), 'alice', 'mainMotion', 'Buy a new grill', 'ben');
    expect(refusal(counted, 'carl', { type: 'REQUEST_DIVISION' })).toMatchObject({
      errorCode: 'VOTING_METHOD',
    });
    expect(refusal(s, 'sam', { type: 'REQUEST_DIVISION' })).toMatchObject({
      errorCode: 'PERMISSION_DENIED',
    });
  });
});
