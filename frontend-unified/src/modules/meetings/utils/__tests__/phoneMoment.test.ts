import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Motion } from '@robbie-bylawyer/shared/types';
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
  ])('asks for one thing %s', (_when, state, moment) => {
    expect(phoneMoment(state)).toBe(moment);
  });
});
