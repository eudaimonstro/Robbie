import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import {
  LOG_MOTION_FAILED_NO_SECOND,
  MOTIONS,
  logAdoptedByConsent,
  logChairRuled,
  logElectionSetAside,
  logMotionWithdrawn,
} from '@robbie-bylawyer/shared/constants';
import type { Election, MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import { parseVoteResult } from '../../hooks/useVoteResults';
import {
  adjournedAt,
  currentResult,
  describeQuestion,
  itemsDecided,
  stageLabel,
} from '../question';

const motion = (key: string, overrides: Partial<Motion> = {}): Motion => ({
  ...MOTIONS[key],
  id: 1,
  type: key,
  text: 'Resurface the pool this spring',
  mover: 'Alice Brennan',
  moverId: 3,
  secondedBy: null,
  status: 'active',
  ...overrides,
});

const active: MeetingState = { ...initialState, meetingActive: true, meetingStage: 'new-business' };

const election = (overrides: Partial<Election> = {}): Election => ({
  id: 7,
  position: 'Director',
  candidates: [
    { name: 'Carmen Diaz', id: 5 },
    { name: 'Ray Castillo', id: 6 },
  ],
  requiredVotes: 'majority',
  votingInProgress: true,
  ballotResults: { 'Carmen Diaz': 0, 'Ray Castillo': 0 },
  votersWhoVoted: [],
  elected: null,
  ...overrides,
});

describe('describeQuestion', () => {
  it('is null when nothing is before the assembly', () => {
    expect(describeQuestion(active)).toBeNull();
  });

  it('says how the motion would read if a pending amendment is adopted, and an amendment of it', () => {
    const main = motion('mainMotion', { text: 'Resurface the pool for $40,000' });
    const amendment = motion('amend', {
      id: 2,
      text: 'Strike \u201c$40,000\u201d and insert \u201c$35,000\u201d',
      textAmendment: { form: 'strikeInsert', strike: '$40,000', insert: '$35,000' },
    });
    const pending = { ...active, currentMotion: amendment, motionStack: [main, amendment] };
    expect(describeQuestion(pending)?.reads).toEqual({
      label: 'If adopted, the motion reads',
      text: 'Resurface the pool for $35,000',
    });
    // Awaiting a second, it reads the same
    expect(
      describeQuestion({
        ...active,
        pendingSecond: amendment,
        currentMotion: main,
        motionStack: [main],
      })?.reads,
    ).toEqual({ label: 'If adopted, the motion reads', text: 'Resurface the pool for $35,000' });
    const secondary = motion('amendAmendment', {
      id: 3,
      textAmendment: { form: 'strikeInsert', strike: '35', insert: '38' },
    });
    expect(
      describeQuestion({
        ...active,
        pendingSecond: secondary,
        currentMotion: amendment,
        motionStack: [main, amendment],
      })?.reads,
    ).toEqual({
      label: 'If adopted, the amendment reads',
      text: 'Strike \u201c$40,000\u201d and insert \u201c$38,000\u201d',
    });
  });

  it('puts the text of a bylaw amendment, as it reads and would read, with the question', () => {
    const bylawAmendment = {
      documentId: 'doc',
      changeType: 'modify' as const,
      targetSectionId: 's42',
      targetSectionLabel: 'Section 4.2 "Quorum"',
      currentContent: 'Twenty percent is a quorum.',
      newContent: 'Fifteen percent is a quorum.',
    };
    for (const state of [
      { ...active, pendingSecond: motion('bylawAmendment', { bylawAmendment }) },
      {
        ...active,
        currentMotion: motion('bylawAmendment', { bylawAmendment }),
        motionStack: [motion('bylawAmendment', { bylawAmendment })],
      },
    ]) {
      expect(describeQuestion(state)?.bylawText).toEqual({
        heading: 'Section 4.2 "Quorum"',
        action: 'To read',
        current: { text: 'Twenty percent is a quorum.' },
        proposed: { text: 'Fifteen percent is a quorum.' },
      });
    }
    // Any other motion has none
    expect(describeQuestion({ ...active, pendingSecond: motion('mainMotion') })).not.toHaveProperty(
      'bylawText',
    );
  });

  it('shows a motion awaiting a second', () => {
    const question = describeQuestion({ ...active, pendingSecond: motion('mainMotion') });
    expect(question).toMatchObject({
      kind: 'Main Motion',
      text: 'Resurface the pool this spring',
      byline: 'Moved by Alice Brennan, awaiting a second',
      requirement: 'Majority',
      awaitingSecond: true,
      beneath: [],
    });
  });

  it('says who moved a motion from the floor, and that a question put by the chair has no mover', () => {
    const floor = motion('mainMotion', { mover: 'Carmen Diaz', moverId: 0, fromFloor: true });
    expect(
      describeQuestion({ ...active, pendingSecond: { ...floor, status: 'pending' } }),
    ).toMatchObject({
      byline: 'Moved from the floor by Carmen Diaz, awaiting a second',
    });
    expect(
      describeQuestion({
        ...active,
        currentMotion: { ...floor, secondedBy: 'a member in the room' },
        motionStack: [floor],
      })?.byline,
    ).toBe('Moved from the floor by Carmen Diaz, seconded by a member in the room');
    const put = motion('mainMotion', {
      text: "Approve: Treasurer's report",
      mover: 'Put by the chair',
      moverId: 0,
      putByChair: true,
    });
    expect(describeQuestion({ ...active, currentMotion: put, motionStack: [put] })?.byline).toBe(
      'Put by the chair',
    );
  });

  it('shows the motion being considered, who moved and seconded it, and what is beneath it', () => {
    const main = motion('mainMotion', { secondedBy: 'Ben Whitaker' });
    const close = motion('previousQuestion', {
      id: 2,
      text: 'I move the previous question.',
      mover: 'Ben Whitaker',
      secondedBy: 'Alice Brennan',
    });
    const question = describeQuestion({
      ...active,
      currentMotion: close,
      motionStack: [main, close],
    });
    expect(question).toMatchObject({
      kind: 'Previous Question (Close Debate)',
      byline: 'Moved by Ben Whitaker, seconded by Alice Brennan',
      requirement: 'Two thirds',
      awaitingSecond: false,
      beneath: ['Main Motion: Resurface the pool this spring'],
      key: 'motion-2',
    });
  });

  it('shows open nominations, and then the ballot', () => {
    const nominating = describeQuestion({
      ...active,
      nominationsOpen: true,
      currentNominationPosition: 'Director',
      nominations: [
        {
          id: 1,
          position: 'Director',
          nomineeName: 'Carmen Diaz',
          nomineeId: 5,
          nominatedBy: 'Alice Brennan',
          nominatorId: 3,
          timestamp: '',
          declined: false,
        },
      ],
    });
    expect(nominating).toMatchObject({
      kind: 'Election for Director',
      text: 'Nominations are open',
      byline: 'Nominated: Carmen Diaz',
    });

    const balloting = describeQuestion({ ...active, currentElection: election() });
    expect(balloting).toMatchObject({
      kind: 'Election for Director',
      text: 'Carmen Diaz, Ray Castillo',
      requirement: 'Majority',
    });
  });

  it('shows nominations closed with the ballot still to open', () => {
    expect(describeQuestion({ ...active, currentNominationPosition: 'Director' })).toMatchObject({
      kind: 'Election for Director',
      text: 'Nominations are closed',
      byline: 'Nobody has been nominated',
    });
  });

  it('puts a motion made during an election before the election', () => {
    const recess = motion('recess', { text: 'Recess for ten minutes' });
    expect(
      describeQuestion({
        ...active,
        nominationsOpen: true,
        currentNominationPosition: 'Director',
        pendingSecond: recess,
      }),
    ).toMatchObject({ text: 'Recess for ten minutes', awaitingSecond: true });
  });

  it('is null once the meeting is adjourned, whatever was left in the state', () => {
    expect(
      describeQuestion({
        ...active,
        meetingActive: false,
        meetingStage: 'adjourned',
        currentMotion: motion('mainMotion'),
        currentElection: election(),
      }),
    ).toBeNull();
  });
});

describe('currentResult', () => {
  const voted = (message: string) => ({
    ...active,
    meetingLog: [
      { time: '7:41:00 PM', message: 'Chair puts the question: "Resurface the pool this spring"' },
      { time: '7:45:00 PM', message },
    ],
  });

  it('stamps the last vote with both parts', () => {
    const state = voted('Vote: Yea 11, Nay 2. CARRIED. On devices 2 to 0, in the room 9 to 2.');
    expect(currentResult(state, parseVoteResult(state.meetingLog))).toMatchObject({
      outcome: 'carried',
      subject: 'Resurface the pool this spring',
      tally: 'On devices 2 to 0, in the room 9 to 2: 11 to 2',
    });
  });

  it('says failed, and keeps it until the next question comes up', () => {
    const state = voted('Vote: Yea 3, Nay 9. FAILED.');
    const vote = parseVoteResult(state.meetingLog);
    expect(currentResult(state, vote)).toMatchObject({ outcome: 'failed', tally: '3 to 9' });
    expect(currentResult({ ...state, pendingSecond: motion('mainMotion') }, vote)).toBeNull();
  });

  describe('the latest decision wins', () => {
    const carried = 'Vote: Yea 11, Nay 2. CARRIED.';
    const after = (message: string, state: MeetingState = voted(carried)) => {
      const later = {
        ...state,
        meetingLog: [
          ...state.meetingLog,
          { time: '7:50:00 PM', message },
          // Lines that decide nothing don't change it
          { time: '7:51:00 PM', message: 'Frank Ruiz has joined the meeting.' },
        ],
      };
      return currentResult(later, parseVoteResult(later.meetingLog));
    };

    it.each([
      ['a ruling of the chair', logChairRuled('The point is well taken.', undefined, 'Order')],
      ['a motion that died for lack of a second', LOG_MOTION_FAILED_NO_SECOND],
      ['a withdrawal', logMotionWithdrawn('Alice Brennan')],
      ['an election set aside', logElectionSetAside('Director')],
      ['an election with no office set aside', logElectionSetAside(null)],
    ])('takes a vote down after %s', (_what, message) => {
      expect(
        currentResult(voted(carried), parseVoteResult(voted(carried).meetingLog)),
      ).not.toBeNull();
      expect(after(message)).toBeNull();
    });

    it('stamps a motion adopted by unanimous consent as adopted, after a vote too', () => {
      const adopted = {
        outcome: 'adopted',
        subject: null,
        tally: 'By unanimous consent',
      };
      expect(after(logAdoptedByConsent())).toMatchObject(adopted);
      expect(after(logAdoptedByConsent(), active)).toMatchObject(adopted);
    });

    it('takes an adoption by unanimous consent down after a withdrawal', () => {
      const adopted = {
        ...active,
        meetingLog: [{ time: '7:45:00 PM', message: logAdoptedByConsent() }],
      };
      expect(after(logMotionWithdrawn('Ben Whitaker'), adopted)).toBeNull();
    });
  });

  it('stamps nothing when the ballot closes with a winner: ELECTED waits for the declaration', () => {
    const state = {
      ...active,
      currentElection: election({
        votingInProgress: false,
        ballotResults: { 'Carmen Diaz': 9, 'Ray Castillo': 5 },
        elected: 'Carmen Diaz',
      }),
    };
    expect(currentResult(state, null)).toBeNull();
    // The question card says who has the vote required, with the count
    expect(describeQuestion(state)).toMatchObject({
      kind: 'Election for Director',
      text: 'Carmen Diaz has the vote required',
      byline: 'Ballot: Carmen Diaz 9, Ray Castillo 5',
    });
  });

  describe('once the chair declares the winner', () => {
    const declared: MeetingState = {
      ...active,
      electedOfficers: [
        { position: 'Director', name: 'Carmen Diaz', memberId: 5, electedAt: '8:30:00 PM' },
      ],
      meetingLog: [
        { time: '7:45:00 PM', message: 'Vote: Yea 11, Nay 2. CARRIED.' },
        {
          time: '8:28:00 PM',
          message:
            'Voting closed for Director. Results: Carmen Diaz: 9 vote(s), Ray Castillo (write-in): 5 vote(s). Carmen Diaz elected.',
        },
        { time: '8:30:00 PM', message: 'Chair declares Carmen Diaz elected as Director.' },
      ],
    };

    it('keeps the election stamp up, with its tally', () => {
      expect(currentResult(declared, parseVoteResult(declared.meetingLog))).toEqual({
        outcome: 'elected',
        subject: 'Carmen Diaz, Director',
        tally: 'Carmen Diaz 9, Ray Castillo (write-in) 5',
        key: 'declared-2',
      });
    });

    it('takes it down when the next question comes up', () => {
      expect(currentResult({ ...declared, pendingSecond: motion('mainMotion') }, null)).toBeNull();
      expect(
        currentResult(
          { ...declared, nominationsOpen: true, currentNominationPosition: 'Treasurer' },
          null,
        ),
      ).toBeNull();
      expect(
        currentResult({ ...declared, currentNominationPosition: 'Treasurer' }, null),
      ).toBeNull();
    });

    it('gives way to a vote taken after it', () => {
      const later: MeetingState = {
        ...declared,
        meetingLog: [
          ...declared.meetingLog,
          { time: '8:35:00 PM', message: 'Chair puts the question: "Plant the hedge"' },
          { time: '8:40:00 PM', message: 'Vote: Yea 3, Nay 9. FAILED.' },
        ],
      };
      expect(currentResult(later, parseVoteResult(later.meetingLog))).toMatchObject({
        outcome: 'failed',
        subject: 'Plant the hedge',
      });
    });
  });
});

describe('the meeting in words', () => {
  it('names where the meeting is: before it, on an item, between items, adjourned', () => {
    expect(stageLabel(initialState)).toBe('Not yet called to order');
    expect(
      stageLabel({
        ...active,
        currentAgendaItem: { id: 2, title: "Treasurer's report", status: 'active' },
      }),
    ).toBe("Treasurer's report");
    expect(stageLabel(active)).toBe('In session');
    expect(stageLabel({ ...initialState, meetingStage: 'adjourned' })).toBe('Adjourned');
  });

  it('says when the meeting adjourned and how many things it decided', () => {
    const record = {
      type: 'mainMotion',
      name: 'Main Motion',
      voterChoices: {},
      reconsidered: false,
    };
    const state: MeetingState = {
      ...initialState,
      meetingStage: 'adjourned',
      meetingLog: [
        { time: '8:10:00 PM', message: 'Motion CARRIED by unanimous consent.' },
        { time: '8:42:15 PM', message: 'Meeting adjourned.' },
      ],
      completedMotions: [
        { ...record, id: 1, text: 'Resurface the pool', passed: true, timestamp: '7:45:00 PM' },
        {
          ...record,
          id: 2,
          text: 'Thank the board',
          passed: true,
          timestamp: '8:10:00 PM',
          disposition: 'unanimous',
        },
        // Recorded for the minutes, but nothing was decided
        {
          ...record,
          id: 3,
          text: 'Paint the clubhouse',
          passed: false,
          timestamp: '8:12:00 PM',
          disposition: 'no-second',
        },
        {
          ...record,
          id: 4,
          text: 'Repave the lot',
          passed: false,
          timestamp: '8:13:00 PM',
          disposition: 'withdrawn',
        },
      ],
      electedOfficers: [
        { position: 'Director', name: 'Carmen Diaz', memberId: 5, electedAt: '8:30:00 PM' },
      ],
    };
    expect(adjournedAt(state)).toBe('8:42 PM');
    // The vote, the unanimous consent (counted once, from its record) and the election
    expect(itemsDecided(state)).toBe(3);
  });
});
