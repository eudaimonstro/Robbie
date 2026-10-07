import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
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

  it('stamps an election when the ballot is closed with a winner', () => {
    const state = {
      ...active,
      currentElection: election({
        votingInProgress: false,
        ballotResults: { 'Carmen Diaz': 9, 'Ray Castillo': 5 },
        elected: 'Carmen Diaz',
      }),
    };
    expect(currentResult(state, null)).toEqual({
      outcome: 'elected',
      subject: 'Carmen Diaz, Director',
      tally: 'Carmen Diaz 9, Ray Castillo 5',
      key: 'election-7',
    });
  });
});

describe('the meeting in words', () => {
  it('names the stage', () => {
    expect(stageLabel(initialState)).toBe('Not yet called to order');
    expect(stageLabel(active)).toBe('New Business');
    expect(stageLabel({ ...initialState, meetingStage: 'adjourned' })).toBe('Adjourned');
  });

  it('says when the meeting adjourned and how many things it decided', () => {
    const state: MeetingState = {
      ...initialState,
      meetingStage: 'adjourned',
      meetingLog: [
        { time: '8:10:00 PM', message: 'Motion CARRIED by unanimous consent.' },
        { time: '8:42:15 PM', message: 'Meeting adjourned.' },
      ],
      completedMotions: [
        {
          id: 1,
          type: 'mainMotion',
          name: 'Main Motion',
          text: 'Resurface the pool',
          passed: true,
          voterChoices: {},
          timestamp: '7:45:00 PM',
          reconsidered: false,
        },
      ],
      electedOfficers: [
        { position: 'Director', name: 'Carmen Diaz', memberId: 5, electedAt: '8:30:00 PM' },
      ],
    };
    expect(adjournedAt(state)).toBe('8:42 PM');
    expect(itemsDecided(state)).toBe(3);
  });
});
