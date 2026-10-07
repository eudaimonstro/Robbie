import { describe, it, expect } from 'vitest';
import { meetingReducer, initialState } from '../../reducer/index.js';
import { A_MEMBER_IN_THE_ROOM, MOTIONS, PUT_BY_CHAIR } from '../../constants/index.js';
import type { Election, MeetingState, Member, Motion } from '../../types/index.js';

// The server's clock when a decision is made (the enricher's `at`)
const AT = '2026-10-21T00:20:00.000Z';

const members: Member[] = [
  { id: 1, name: 'Ann', role: 'chair', present: true, presentBy: 'device' },
  { id: 2, name: 'Bo', role: 'member', present: true, presentBy: 'device' },
  { id: 3, name: 'Cy', role: 'member', present: true, presentBy: 'device' },
];
const item = { id: 3, title: 'Old business', status: 'active' as const };

/** A meeting in session with a quorum (3 of 3), during agenda item 3 */
const inSession: MeetingState = {
  ...initialState,
  meetingActive: true,
  meetingStage: 'new-business',
  members,
  quorum: 3,
  agenda: [item],
  currentAgendaItem: item,
};

const motion = (overrides: Partial<Motion> = {}): Motion => ({
  ...MOTIONS.mainMotion,
  id: 7,
  type: 'mainMotion',
  text: 'Resurface the pool',
  mover: 'Bo',
  moverId: 2,
  secondedBy: 'Cy',
  status: 'active',
  ...overrides,
});

const awaitingSecond = () => motion({ secondedBy: null, status: 'pending' });

describe('the meeting record', () => {
  it('keeps the seconder, the agenda item, the quorum and the time of a vote', () => {
    const voting: MeetingState = {
      ...inSession,
      currentMotion: motion(),
      motionStack: [motion()],
      votingOpen: true,
      votes: { yea: 2, nay: 0, abstain: 0 },
      floorVotes: { yea: 9, nay: 2, abstain: 0 },
    };
    const closed = meetingReducer(voting, {
      type: 'CLOSE_VOTING',
      at: AT,
      timestamp: '7:20:00 PM',
    });
    expect(closed.completedMotions).toEqual([
      expect.objectContaining({
        id: 7,
        mover: 'Bo',
        seconder: 'Cy',
        passed: true,
        disposition: 'carried',
        agendaItemId: 3,
        quorumPresent: true,
        decidedAt: AT,
        deviceVotes: { yea: 2, nay: 0, abstain: 0 },
        floorVotes: { yea: 9, nay: 2, abstain: 0 },
      }),
    ]);
  });

  it('keeps a failed vote without a quorum, and no time without the clock', () => {
    const voting: MeetingState = {
      ...inSession,
      members: [members[0], { ...members[1], present: false }, { ...members[2], present: false }],
      currentMotion: motion(),
      motionStack: [motion()],
      votingOpen: true,
      votes: { yea: 0, nay: 1, abstain: 0 },
    };
    const record = meetingReducer(voting, { type: 'CLOSE_VOTING', timestamp: '' })
      .completedMotions[0];
    expect(record).toMatchObject({ passed: false, disposition: 'failed', quorumPresent: false });
    expect(record).not.toHaveProperty('decidedAt');
  });

  it('keeps a motion that died for lack of a second', () => {
    const next = meetingReducer(
      { ...inSession, pendingSecond: awaitingSecond() },
      { type: 'DECLINE_SECOND', at: AT, timestamp: '7:21:00 PM' },
    );
    expect(next.pendingSecond).toBeNull();
    expect(next.completedMotions).toEqual([
      {
        id: 7,
        type: 'mainMotion',
        name: 'Main Motion',
        text: 'Resurface the pool',
        passed: false,
        voterChoices: {},
        timestamp: '7:21:00 PM',
        reconsidered: false,
        reconsiderable: false,
        mover: 'Bo',
        moverId: 2,
        disposition: 'no-second',
        agendaItemId: 3,
        decidedAt: AT,
      },
    ]);
  });

  it('keeps a withdrawn motion, awaiting a second or seconded, but only its mover can withdraw it', () => {
    const awaiting = meetingReducer(
      { ...inSession, pendingSecond: awaitingSecond() },
      { type: 'WITHDRAW_MOTION', requesterId: 2, at: AT, timestamp: '7:22:00 PM' },
    );
    expect(awaiting.completedMotions).toEqual([
      expect.objectContaining({ id: 7, disposition: 'withdrawn', passed: false, decidedAt: AT }),
    ]);
    expect(awaiting.completedMotions[0]).not.toHaveProperty('seconder');

    const pending = { ...inSession, currentMotion: motion(), motionStack: [motion()] };
    const seconded = meetingReducer(pending, {
      type: 'WITHDRAW_MOTION',
      requesterId: 2,
      timestamp: '7:23:00 PM',
    });
    expect(seconded.currentMotion).toBeNull();
    expect(seconded.completedMotions).toEqual([
      expect.objectContaining({
        id: 7,
        disposition: 'withdrawn',
        seconder: 'Cy',
        reconsiderable: false,
      }),
    ]);

    const refused = meetingReducer(pending, {
      type: 'WITHDRAW_MOTION',
      requesterId: 3,
      timestamp: '',
    });
    expect(refused).toBe(pending);
  });

  it('keeps a motion adopted by unanimous consent, with the quorum', () => {
    const asking = {
      ...inSession,
      currentMotion: motion(),
      motionStack: [motion()],
      unanimousConsentPending: true,
    };
    const adopted = meetingReducer(asking, {
      type: 'UNANIMOUS_CONSENT_PASSED',
      at: AT,
      timestamp: '7:24:00 PM',
    });
    expect(adopted.completedMotions).toEqual([
      expect.objectContaining({
        id: 7,
        passed: true,
        disposition: 'unanimous',
        quorumPresent: true,
        seconder: 'Cy',
        agendaItemId: 3,
        decidedAt: AT,
        voterChoices: {},
        reconsiderable: MOTIONS.mainMotion.reconsidered,
      }),
    ]);
  });

  it("keeps each ruling of the chair, which lastChairRuling doesn't", () => {
    const point = motion({
      ...MOTIONS.pointOrder,
      id: 8,
      type: 'pointOrder',
      text: 'The speaker is off the subject',
    });
    const ruled = meetingReducer(
      { ...inSession, currentMotion: point, motionStack: [motion(), point] },
      {
        type: 'CHAIR_RULING',
        ruling: 'sustain',
        explanation: 'Debate must be on the motion',
        at: AT,
        timestamp: '7:25:00 PM',
      },
    );
    expect(ruled.chairRulings).toEqual([
      {
        ruling: 'The point is well taken.',
        explanation: 'Debate must be on the motion',
        motionText: 'The speaker is off the subject',
        timestamp: '7:25:00 PM',
        agendaItemId: 3,
        decidedAt: AT,
      },
    ]);
  });

  it('keeps each ballot of an election, and gives them to the officer elected', () => {
    const election: Election = {
      id: 1,
      position: 'Director',
      candidates: [
        { name: 'Carmen', id: 4 },
        { name: 'Ray', id: 5 },
      ],
      requiredVotes: 'majority',
      votingInProgress: true,
      ballotResults: { Carmen: 4, Ray: 4 },
      votersWhoVoted: [1, 2, 3, 4, 5, 6, 7, 8],
      floorBallots: { Carmen: 1, Ray: 1 },
      elected: null,
    };
    // A tie: a second ballot opens, and the first is kept
    let state = meetingReducer(
      { ...inSession, currentElection: election },
      { type: 'CLOSE_ELECTION', timestamp: '8:00:00 PM' },
    );
    expect(state.currentElection?.ballots).toEqual([{ Carmen: 5, Ray: 5 }]);

    state = {
      ...state,
      currentElection: {
        ...state.currentElection!,
        ballotResults: { Carmen: 6, Ray: 3 },
        votersWhoVoted: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      },
    };
    state = meetingReducer(state, { type: 'CLOSE_ELECTION', timestamp: '8:05:00 PM' });
    expect(state.currentElection?.elected).toBe('Carmen');

    state = meetingReducer(state, {
      type: 'DECLARE_ELECTED',
      candidateName: 'Carmen',
      at: AT,
      timestamp: '8:06:00 PM',
    });
    expect(state.electedOfficers).toEqual([
      {
        position: 'Director',
        name: 'Carmen',
        memberId: 4,
        electedAt: '8:06:00 PM',
        ballots: [
          { Carmen: 5, Ray: 5 },
          { Carmen: 6, Ray: 3 },
        ],
        agendaItemId: 3,
        decidedAt: AT,
      },
    ]);
  });

  it('keeps the approval of the minutes, as read or with corrections', () => {
    const asRead = meetingReducer(inSession, {
      type: 'APPROVE_MINUTES',
      at: AT,
      timestamp: '7:05:00 PM',
    });
    expect(asRead.minutesApproved).toBe(true);
    expect(asRead.minutesApproval).toEqual({
      corrections: null,
      timestamp: '7:05:00 PM',
      agendaItemId: 3,
      decidedAt: AT,
    });
    expect(asRead.meetingLog.at(-1)?.message).toBe('Minutes from previous meeting approved.');

    const corrected = meetingReducer(inSession, {
      type: 'APPROVE_MINUTES',
      corrections: '  Adjourned at 8:15 PM, not 8:50 PM.  ',
      timestamp: '7:05:00 PM',
    });
    expect(corrected.minutesApproval?.corrections).toBe('Adjourned at 8:15 PM, not 8:50 PM.');
    expect(corrected.meetingLog.at(-1)?.message).toBe(
      'Minutes from previous meeting approved with corrections: Adjourned at 8:15 PM, not 8:50 PM.',
    );

    const blank = meetingReducer(inSession, {
      type: 'APPROVE_MINUTES',
      corrections: '   ',
      timestamp: '',
    });
    expect(blank.minutesApproval?.corrections).toBeNull();
  });

  it('notes which published minutes are before the meeting', () => {
    const loaded = meetingReducer(initialState, {
      type: 'SET_PREVIOUS_MINUTES',
      minutes: '# Minutes of the 2025 Annual Meeting',
      minutesId: 'minutes-1',
    });
    expect(loaded).toMatchObject({
      minutesFromPreviousMeeting: '# Minutes of the 2025 Annual Meeting',
      previousMinutesId: 'minutes-1',
    });
    const typed = meetingReducer(loaded, { type: 'SET_PREVIOUS_MINUTES', minutes: 'Typed in' });
    expect(typed.previousMinutesId).toBeNull();
  });

  it('notes whether a quorum was present at the call to order', () => {
    const before = { ...initialState, members, quorum: 3 };
    const start = { type: 'START_MEETING' as const, timestamp: '' };
    expect(meetingReducer(before, start).quorumAtCallToOrder).toBe(true);
    expect(meetingReducer({ ...before, quorum: 4 }, start).quorumAtCallToOrder).toBe(false);
  });

  it('remembers who attended, also once they leave', () => {
    let state: MeetingState = initialState;
    state = meetingReducer(state, {
      type: 'ADD_MEMBER',
      member: { id: 2, name: 'Bo', role: 'member', present: true },
      timestamp: '',
    });
    state = meetingReducer(state, {
      type: 'SET_MEMBER_PRESENCE',
      memberId: 2,
      present: false,
      timestamp: '',
    });
    state = meetingReducer(state, {
      type: 'MARK_PRESENT',
      userId: 3,
      member: { id: 3, name: 'Cy', role: 'member', present: false },
      timestamp: '',
    });
    state = meetingReducer(state, {
      type: 'ADD_MEMBER',
      member: { id: 4, name: 'Di', role: 'member', present: false },
      timestamp: '',
    });
    expect(state.attendedIds).toEqual([2, 3]);

    state = meetingReducer(state, {
      type: 'SET_MEMBER_PRESENCE',
      memberId: 4,
      present: true,
      timestamp: '',
    });
    expect(state.attendedIds).toEqual([2, 3, 4]);
  });

  it('keeps records in a state saved before they existed', () => {
    const { chairRulings: _rulings, attendedIds: _attended, ...old } = inSession;
    const point = motion({ ...MOTIONS.pointOrder, id: 8, type: 'pointOrder', text: 'Order' });
    const ruled = meetingReducer(
      { ...old, currentMotion: point, motionStack: [point] } as MeetingState,
      { type: 'CHAIR_RULING', ruling: 'overrule', timestamp: '' },
    );
    expect(ruled.chairRulings).toHaveLength(1);
    const joined = meetingReducer(old as MeetingState, {
      type: 'SET_MEMBER_PRESENCE',
      memberId: 2,
      present: false,
      timestamp: '',
    });
    expect(joined.members[1].present).toBe(false);
  });
});

describe('the record of business from the floor, set aside or left unfinished', () => {
  it('keeps the name the chair recorded for a motion from the floor that died', () => {
    const made = meetingReducer(inSession, {
      type: 'MAKE_FLOOR_MOTION',
      motionType: 'mainMotion',
      text: 'Paint the clubhouse',
      moverName: 'Dee Fox',
      motionId: 9,
      timestamp: '',
    });
    const died = meetingReducer(made, { type: 'DECLINE_SECOND', at: AT, timestamp: '' });
    expect(died.completedMotions).toEqual([
      expect.objectContaining({ id: 9, mover: 'Dee Fox', moverId: 0, disposition: 'no-second' }),
    ]);
    expect(died.completedMotions[0]).not.toHaveProperty('seconder');
  });

  it('keeps a second from the floor, named or not', () => {
    const made = meetingReducer(
      { ...inSession, pendingSecond: awaitingSecond() },
      { type: 'SECOND_FROM_FLOOR', timestamp: '' },
    );
    const adopted = meetingReducer(
      { ...made, unanimousConsentPending: true },
      { type: 'UNANIMOUS_CONSENT_PASSED', at: AT, timestamp: '' },
    );
    expect(adopted.completedMotions[0]).toMatchObject({
      seconder: A_MEMBER_IN_THE_ROOM,
      disposition: 'unanimous',
    });
  });

  it('keeps a question the chair put, with no mover and no second', () => {
    const put = meetingReducer(inSession, {
      type: 'MAKE_MOTION',
      motionType: 'mainMotion',
      text: 'Approve the budget',
      mover: 'Ann',
      moverId: 1,
      motionId: 10,
      putByChair: true,
      timestamp: '',
    });
    const voting = { ...put, votingOpen: true, votes: { yea: 2, nay: 0, abstain: 0 } };
    const record = meetingReducer(voting, { type: 'CLOSE_VOTING', at: AT, timestamp: '' })
      .completedMotions[0];
    expect(record).toMatchObject({ mover: PUT_BY_CHAIR, moverId: 0, disposition: 'carried' });
    expect(record).not.toHaveProperty('seconder');
  });

  it('keeps an election set aside, with its closed ballots and none of the open one', () => {
    const election: Election = {
      id: 1,
      position: 'Director',
      candidates: [
        { name: 'Carmen', id: 4 },
        { name: 'Ray', id: 5 },
      ],
      requiredVotes: 'majority',
      votingInProgress: true,
      ballotResults: { Carmen: 1, Ray: 0 },
      votersWhoVoted: [2],
      ballots: [{ Carmen: 4, Ray: 4 }],
      elected: null,
    };
    const setAside = meetingReducer(
      { ...inSession, currentElection: election },
      { type: 'SET_ASIDE_ELECTION', at: AT, timestamp: '8:10:00 PM' },
    );
    expect(setAside.currentElection).toBeNull();
    expect(setAside.electionsSetAside).toEqual([
      {
        position: 'Director',
        ballots: [{ Carmen: 4, Ray: 4 }],
        timestamp: '8:10:00 PM',
        agendaItemId: 3,
        decidedAt: AT,
      },
    ]);

    // Nominations with nobody nominated: no ballots
    const nominations = meetingReducer(
      { ...inSession, nominationsOpen: true, currentNominationPosition: 'Treasurer' },
      { type: 'SET_ASIDE_ELECTION', timestamp: '' },
    );
    expect(nominations.electionsSetAside).toEqual([
      { position: 'Treasurer', timestamp: '', agendaItemId: 3 },
    ]);
  });

  it('keeps the business the meeting adjourned with unfinished', () => {
    const amendment = motion({
      ...MOTIONS.amend,
      id: 8,
      type: 'amend',
      text: 'Strike "spring"',
      mover: 'Cy',
      moverId: 3,
      secondedBy: null,
      status: 'pending',
    });
    const adjourned = meetingReducer(
      {
        ...inSession,
        meetingActive: true,
        currentMotion: motion(),
        motionStack: [motion()],
        pendingSecond: amendment,
      },
      { type: 'END_MEETING', timestamp: '9:00:00 PM' },
    );
    expect(adjourned.unfinishedAtAdjournment).toEqual([
      {
        kind: 'motion',
        id: 7,
        name: 'Main Motion',
        text: 'Resurface the pool',
        mover: 'Bo',
        seconder: 'Cy',
        agendaItemId: 3,
      },
      {
        kind: 'motion',
        id: 8,
        name: MOTIONS.amend.name,
        text: 'Strike "spring"',
        mover: 'Cy',
        awaitingSecond: true,
        agendaItemId: 3,
      },
    ]);

    // An election decided but not declared, with its ballots; nothing unfinished adds nothing
    const undeclared = meetingReducer(
      {
        ...inSession,
        currentElection: {
          id: 1,
          position: 'Director',
          candidates: [{ name: 'Carmen', id: 4 }],
          requiredVotes: 'majority',
          votingInProgress: false,
          ballotResults: { Carmen: 6 },
          votersWhoVoted: [],
          ballots: [{ Carmen: 6 }],
          elected: 'Carmen',
        },
      },
      { type: 'END_MEETING', timestamp: '' },
    );
    expect(undeclared.unfinishedAtAdjournment).toEqual([
      { kind: 'election', position: 'Director', ballots: [{ Carmen: 6 }], agendaItemId: 3 },
    ]);
    const quiet = meetingReducer(inSession, { type: 'END_MEETING', timestamp: '' });
    expect(quiet.unfinishedAtAdjournment).toEqual([]);
  });
});
