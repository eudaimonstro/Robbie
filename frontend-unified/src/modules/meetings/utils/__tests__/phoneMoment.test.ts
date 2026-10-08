import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { Election, MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import { phoneMoment } from '../phoneMoment';

const motion = (key: string): Motion => ({
  ...MOTIONS[key],
  id: 1,
  type: key,
  text: 'Approve the pool contract',
  mover: 'Alice Brennan',
  moverId: 3,
  secondedBy: 'Ben Whitaker',
  status: 'active',
});

const election = (overrides: Partial<Election>): Election => ({
  id: 1,
  position: 'Director',
  candidates: [{ name: 'Carmen Diaz', id: 5 }],
  requiredVotes: 'majority',
  votingInProgress: false,
  ballotResults: { 'Carmen Diaz': 2 },
  votersWhoVoted: [3, 4],
  elected: null,
  ...overrides,
});

const active: MeetingState = { ...initialState, meetingActive: true, agendaAdopted: true };

describe('phoneMoment', () => {
  it.each<[string, MeetingState, string]>([
    ['before the call to order', initialState, 'lobby'],
    ['after the adjournment', { ...initialState, meetingStage: 'adjourned' }, 'adjourned'],
    ['while the agenda awaits adoption', { ...active, agendaAdopted: false }, 'agenda'],
    ['with nothing pending', active, 'motion'],
    [
      'while a motion awaits a second',
      { ...active, pendingSecond: motion('mainMotion') },
      'second',
    ],
    [
      'while a debatable motion is pending',
      { ...active, currentMotion: motion('mainMotion') },
      'debate',
    ],
    [
      'while an undebatable motion is pending',
      { ...active, currentMotion: motion('previousQuestion') },
      'motion',
    ],
    [
      'while the chair asks for unanimous consent',
      { ...active, currentMotion: motion('mainMotion'), unanimousConsentPending: true },
      'consent',
    ],
    [
      'while a vote is open',
      { ...active, currentMotion: motion('mainMotion'), votingOpen: true },
      'vote',
    ],
    [
      'while a voice vote is open',
      { ...active, currentMotion: motion('mainMotion'), votingOpen: true, votingMethod: 'voice' },
      'voice-vote',
    ],
    [
      'while nominations are open',
      { ...active, nominationsOpen: true, currentNominationPosition: 'Director' },
      'nominate',
    ],
    [
      'while nominations are closed and the ballot is still to open',
      { ...active, currentNominationPosition: 'Director' },
      'election',
    ],
    [
      'while the ballot is open',
      { ...active, currentElection: election({ votingInProgress: true }) },
      'ballot',
    ],
    [
      'while a winner awaits the declaration',
      { ...active, currentElection: election({ elected: 'Carmen Diaz' }) },
      'election',
    ],
    [
      'while the agenda awaits adoption during an election',
      { ...active, agendaAdopted: false, currentNominationPosition: 'Director' },
      'election',
    ],
    [
      'while the minutes are before the meeting',
      {
        ...active,
        currentAgendaItem: { id: 2, title: 'Approval of the minutes', status: 'active' },
        previousMinutesId: 'm1',
      },
      'minutes',
    ],
    [
      'once the minutes are approved',
      {
        ...active,
        currentAgendaItem: { id: 2, title: 'Approval of the minutes', status: 'active' },
        previousMinutesId: 'm1',
        minutesApproved: true,
      },
      'motion',
    ],
    [
      'while a motion is made during the minutes',
      {
        ...active,
        currentAgendaItem: { id: 2, title: 'Approval of the minutes', status: 'active' },
        previousMinutesId: 'm1',
        pendingSecond: motion('mainMotion'),
      },
      'second',
    ],
    [
      'at an item that gives itself a length of time',
      {
        ...active,
        currentAgendaItem: {
          id: 3,
          title: 'Homeowner forum (3 minutes per speaker)',
          status: 'active',
        },
        previousMinutesId: 'm1',
      },
      'motion',
    ],
    [
      'at an item about the minutes with no minutes to approve',
      {
        ...active,
        currentAgendaItem: { id: 2, title: 'Approval of the minutes', status: 'active' },
      },
      'motion',
    ],
  ])('asks for one thing %s', (_when, state, moment) => {
    expect(phoneMoment(state)).toBe(moment);
  });
});
