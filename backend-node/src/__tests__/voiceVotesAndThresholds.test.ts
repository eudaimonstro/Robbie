import { describe, it, expect } from 'vitest';
import type { MeetingState, VoteThreshold } from '@robbie-bylawyer/shared/types';
import { publicState } from '../socket/statePublisher.js';
import {
  act,
  inSession,
  minutesOf,
  move,
  moved,
  refusal,
  vote,
} from './support/meetingPipeline.js';

/** A motion on a voice vote, opened */
function voiceVoteOn(s: MeetingState): MeetingState {
  s = act(s, 'dana', { type: 'SET_VOTING_METHOD', method: 'voice' });
  return act(s, 'dana', { type: 'OPEN_VOTING', voteTimerEnd: null });
}

const grill = () => moved(inSession(), 'alice', 'mainMotion', 'Buy a new grill', 'ben');

describe('a voice vote the chair declares', () => {
  it('is decided without a count and minuted "by voice vote"', () => {
    let s = voiceVoteOn(grill());
    s = act(s, 'dana', { type: 'CLOSE_VOTING', declared: 'ayes' });
    expect(s.completedMotions.at(-1)).toMatchObject({
      disposition: 'carried',
      declared: 'ayes',
      method: 'voice',
      deviceVotes: { yea: 0, nay: 0, abstain: 0 },
    });
    expect(s.meetingLog.at(-1)?.message).toBe('Voice vote: the ayes have it. CARRIED.');
    expect(minutesOf(s)).toContain(
      'Alice Brennan moved: "Buy a new grill." Seconded by Ben Whitaker. Carried by voice vote. A quorum was present.',
    );
    // Clients see the result, open to a division, but not what a division would put back
    expect(s.voiceVote?.undo).toBeDefined();
    expect(publicState(s, 'member').voiceVote).toEqual({
      motionId: s.completedMotions.at(-1)?.id,
      passed: true,
    });
  });

  it('is reopened as a counted vote when a member calls for a division right after (RONR 29:7)', () => {
    let s = act(voiceVoteOn(grill()), 'dana', { type: 'CLOSE_VOTING', declared: 'noes' });
    expect(s.currentMotion).toBeNull();
    s = act(s, 'carl', { type: 'REQUEST_DIVISION' });
    expect(s).toMatchObject({ votingOpen: true, divisionCalled: true, voiceVote: null });
    expect(s.currentMotion?.text).toBe('Buy a new grill');
    expect(s.completedMotions).toHaveLength(0);
    expect(s.meetingLog.at(-1)?.message).toBe(
      'Carl Moss calls for a division: the vote is counted.',
    );
    s = act(s, 'carl', { type: 'CAST_VOTE', vote: 'yea', voterId: 0 });
    s = act(s, 'eve', { type: 'CAST_VOTE', vote: 'yea', voterId: 0 });
    s = act(s, 'dana', { type: 'SET_FLOOR_TALLY', yea: 9, nay: 4, abstain: 0 });
    s = act(s, 'dana', { type: 'CLOSE_VOTING' });
    expect(s.completedMotions).toHaveLength(1);
    expect(minutesOf(s)).toContain(
      'Carried on a division, on devices 2 to 0 and in the room 9 to 4: 11 to 4.',
    );
  });

  it('is too late for a division once other business comes up', () => {
    let s = act(voiceVoteOn(grill()), 'dana', { type: 'CLOSE_VOTING', declared: 'ayes' });
    // Someone marked present, or asking to speak, leaves it open
    s = act(s, 'carl', { type: 'RAISE_HAND', stance: 'neutral' });
    expect(s.voiceVote).not.toBeNull();
    s = move(s, 'eve', 'mainMotion', 'Paint the clubhouse');
    expect(s.voiceVote).toBeNull();
    expect(refusal(s, 'carl', { type: 'REQUEST_DIVISION' })).toMatchObject({
      errorCode: 'VOTING_METHOD',
    });
  });

  it('puts the meeting back in session when an adjournment declared by voice is divided', () => {
    let s = moved(inSession(), 'alice', 'adjourn', 'I move that we adjourn', 'ben');
    s = act(voiceVoteOn(s), 'dana', { type: 'CLOSE_VOTING', declared: 'ayes' });
    expect(s.adjournmentCarried).toBe(true);
    s = act(s, 'carl', { type: 'REQUEST_DIVISION' });
    expect(s.adjournmentCarried).toBeFalsy();
    expect(s.currentMotion?.type).toBe('adjourn');
    expect(s.votingOpen).toBe(true);
  });

  it('puts an amendment back as it was, the motion beneath unamended', () => {
    let s = moved(grill(), 'carl', 'amend', 'Insert "gas"', 'eve', {
      textAmendment: { form: 'insert', insert: 'gas', after: 'new' },
    });
    s = act(voiceVoteOn(s), 'dana', { type: 'CLOSE_VOTING', declared: 'ayes' });
    expect(s.currentMotion?.text).toBe('Buy a new gas grill');
    s = act(s, 'alice', { type: 'REQUEST_DIVISION' });
    expect(s.currentMotion?.type).toBe('amend');
    expect(s.motionStack[0].text).toBe('Buy a new grill');
  });

  it('is only for a majority of the votes cast, on a voice vote, and never a bylaw amendment', () => {
    // A counted vote isn't declared
    let s = act(grill(), 'dana', { type: 'OPEN_VOTING', voteTimerEnd: null });
    expect(refusal(s, 'dana', { type: 'CLOSE_VOTING', declared: 'ayes' })?.error).toBe(
      'Only a voice vote is declared without a count',
    );
    // Two thirds is counted
    s = moved(grill(), 'carl', 'previousQuestion', 'Close debate', 'eve');
    s = voiceVoteOn(s);
    expect(refusal(s, 'dana', { type: 'CLOSE_VOTING', declared: 'ayes' })?.error).toBe(
      'A vote of two thirds is counted: enter the count in the room',
    );
    expect(refusal(s, 'alice', { type: 'CLOSE_VOTING', declared: 'ayes' })?.errorCode).toBe(
      'PERMISSION_DENIED',
    );
  });
});

describe('a bylaw amendment under the organization’s threshold', () => {
  const amendment = (voteRequired?: VoteThreshold) => ({
    documentId: 'doc',
    changeType: 'modify' as const,
    targetSectionId: 's42',
    targetSectionLabel: 'Section 4.2 "Quorum"',
    newContent: 'Ten percent of the lots.',
    ...(voteRequired ? { voteRequired } : {}),
  });
  const bylaw = (voteRequired?: VoteThreshold) =>
    moved(inSession(), 'alice', 'bylawAmendment', 'Amend Section 4.2', 'ben', {
      bylawAmendment: amendment(voteRequired),
    });
  const ofMembers = (fraction: 'majority' | '2/3', members: number): VoteThreshold => ({
    fraction,
    of: 'members',
    members,
  });

  it('of all the voting members fails short of the number needed, however lopsided the vote', () => {
    // Two thirds of 9 is 6: five yes and nobody against is not enough
    const s = vote(bylaw(ofMembers('2/3', 9)), {
      pat: 'yea',
      alice: 'yea',
      ben: 'yea',
      carl: 'yea',
      eve: 'yea',
    });
    expect(s.completedMotions.at(-1)).toMatchObject({ passed: false, disposition: 'failed' });
    expect(minutesOf(s)).toContain(
      'Failed, two thirds of all 9 voting members required (6 votes), 5 to 0.',
    );
  });

  it('carries with the votes needed, counting the room', () => {
    let s = act(bylaw(ofMembers('majority', 9)), 'dana', {
      type: 'OPEN_VOTING',
      voteTimerEnd: null,
    });
    s = act(s, 'alice', { type: 'CAST_VOTE', vote: 'yea', voterId: 0 });
    s = act(s, 'dana', { type: 'SET_FLOOR_TALLY', yea: 4, nay: 1, abstain: 0 });
    // 5 of 9 is a majority of all the members
    s = act(s, 'dana', { type: 'CLOSE_VOTING' });
    expect(s.completedMotions.at(-1)).toMatchObject({ passed: true });
  });

  it("lets the chair vote when the chair's vote reaches the number needed", () => {
    let s = act(bylaw(ofMembers('majority', 9)), 'dana', {
      type: 'OPEN_VOTING',
      voteTimerEnd: null,
    });
    s = act(s, 'dana', { type: 'SET_FLOOR_TALLY', yea: 4, nay: 0, abstain: 0 });
    // 4 of 9 falls one short; the chair's makes 5
    expect(
      refusal(s, 'dana', { type: 'CAST_VOTE', vote: 'yea', voterId: 0, isChairDecidingVote: true }),
    ).toBeNull();
  });

  it('of the votes cast by a majority, when the organization says so, and two thirds without a setting', () => {
    const majority = vote(bylaw({ fraction: 'majority', of: 'cast' }), {
      alice: 'yea',
      ben: 'yea',
      carl: 'nay',
    });
    expect(majority.completedMotions.at(-1)?.passed).toBe(true);
    const twoThirds = vote(bylaw(), { alice: 'yea', ben: 'yea', carl: 'nay', eve: 'nay' });
    expect(twoThirds.completedMotions.at(-1)?.passed).toBe(false);
    expect(minutesOf(twoThirds)).toContain('Failed, two thirds required, 2 to 2.');
  });
});
