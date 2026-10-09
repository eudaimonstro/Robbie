import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSortedSpeakerQueue } from '../useSortedSpeakerQueue';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { SpeakerQueueEntry, Motion, MeetingState } from '@robbie-bylawyer/shared/types';

// Helper to create mock state (initialState supplies fields added since these tests were written)
const createMockState = (): MeetingState => ({
  ...initialState,
  meetingActive: true,
  meetingCode: 'TEST01',
  agenda: [],
  currentAgendaItem: null,
  agendaAdopted: true,
  agendaObjection: false,
  currentMotion: null,
  pendingSecond: null,
  motionStack: [],
  votes: { yea: 0, nay: 0, abstain: 0 },
  voters: [],
  voterChoices: {},
  votingOpen: false,
  votingMethod: 'standard',
  speakerQueue: [],
  recognizedSpeaker: null,
  speakerTimerEnd: null,
  voteTimerEnd: null,
  speakerTimeLimit: 120,
  voteTimeLimit: 60,
  lastSpeakerStance: null,
  members: [],
  quorum: 3,
  meetingLog: [],
  unanimousConsentPending: false,
  tabledMotions: [],
  defeatedMotions: [],
  completedMotions: [],
  lastChairRuling: null,
  meetingStage: 'new-business',
  minutesApproved: false,
  minutesFromPreviousMeeting: '',
  committeeReports: [],
  nominationsOpen: false,
  currentNominationPosition: null,
  nominations: [],
  currentElection: null,
  electedOfficers: [],
  inquiries: [],
});

const createMockMotion = (moverId: number = 1, moverHasSpoken: boolean = false): Motion => ({
  id: 1,
  type: 'mainMotion',
  name: 'Main Motion',
  text: 'Test motion',
  mover: 'Test User',
  moverId,
  precedence: 1,
  debatable: true,
  amendable: true,
  vote: 'majority',
  interrupt: false,
  category: 'main',
  help: 'Test help',
  phrase: 'I move that...',
  status: 'active',
  moverHasSpoken,
  secondedBy: 'Second User',
  needsSecond: true,
  reconsidered: true,
  whenToUse: 'Test usage',
});

describe('useSortedSpeakerQueue', () => {
  it('should return empty array for empty queue', () => {
    const state = createMockState();
    const { result } = renderHook(() => useSortedSpeakerQueue([], null, null, state));
    expect(result.current).toEqual([]);
  });

  it('should prioritize motion maker who has not spoken', () => {
    const queue: SpeakerQueueEntry[] = [
      { member: { id: 2, name: 'Alice', role: 'member', present: true }, stance: 'pro' },
      { member: { id: 1, name: 'Bob', role: 'member', present: true }, stance: 'con' },
      { member: { id: 3, name: 'Carol', role: 'member', present: true }, stance: 'neutral' },
    ];
    const motion = createMockMotion(1, false); // Bob (id 1) is the mover
    const state = createMockState();

    const { result } = renderHook(() => useSortedSpeakerQueue(queue, motion, null, state));

    expect(result.current[0].member.name).toBe('Bob');
  });

  it('should not prioritize motion maker who has already spoken', () => {
    const queue: SpeakerQueueEntry[] = [
      { member: { id: 2, name: 'Alice', role: 'member', present: true }, stance: 'pro' },
      { member: { id: 1, name: 'Bob', role: 'member', present: true }, stance: 'con' },
    ];
    const motion = createMockMotion(1, true); // Bob has spoken
    const state = createMockState();

    const { result } = renderHook(() => useSortedSpeakerQueue(queue, motion, null, state));

    // Order should be maintained
    expect(result.current[0].member.name).toBe('Alice');
  });

  it('should alternate pro/con after last speaker was pro', () => {
    const queue: SpeakerQueueEntry[] = [
      { member: { id: 1, name: 'Alice', role: 'member', present: true }, stance: 'pro' },
      { member: { id: 2, name: 'Bob', role: 'member', present: true }, stance: 'con' },
      { member: { id: 3, name: 'Carol', role: 'member', present: true }, stance: 'pro' },
    ];
    const state = createMockState();

    const { result } = renderHook(() => useSortedSpeakerQueue(queue, null, 'pro', state));

    // Bob (con) should be first since last speaker was pro
    expect(result.current[0].member.name).toBe('Bob');
  });

  it('should alternate pro/con after last speaker was con', () => {
    const queue: SpeakerQueueEntry[] = [
      { member: { id: 1, name: 'Alice', role: 'member', present: true }, stance: 'con' },
      { member: { id: 2, name: 'Bob', role: 'member', present: true }, stance: 'pro' },
      { member: { id: 3, name: 'Carol', role: 'member', present: true }, stance: 'con' },
    ];
    const state = createMockState();

    const { result } = renderHook(() => useSortedSpeakerQueue(queue, null, 'con', state));

    // Bob (pro) should be first since last speaker was con
    expect(result.current[0].member.name).toBe('Bob');
  });

  it('should handle neutral stance without affecting alternation', () => {
    const queue: SpeakerQueueEntry[] = [
      { member: { id: 1, name: 'Alice', role: 'member', present: true }, stance: 'neutral' },
      { member: { id: 2, name: 'Bob', role: 'member', present: true }, stance: 'con' },
    ];
    const state = createMockState();

    const { result } = renderHook(() => useSortedSpeakerQueue(queue, null, 'pro', state));

    // Bob (con) should be prioritized over neutral Alice
    expect(result.current[0].member.name).toBe('Bob');
  });

  it('should combine motion maker priority with pro/con alternation', () => {
    const queue: SpeakerQueueEntry[] = [
      { member: { id: 3, name: 'Carol', role: 'member', present: true }, stance: 'con' },
      { member: { id: 1, name: 'Bob', role: 'member', present: true }, stance: 'pro' },
      { member: { id: 2, name: 'Alice', role: 'member', present: true }, stance: 'con' },
    ];
    const motion = createMockMotion(1, false); // Bob is the mover
    const state = createMockState();

    const { result } = renderHook(() => useSortedSpeakerQueue(queue, motion, 'pro', state));

    // Bob should be first as motion maker, even though last speaker was pro
    expect(result.current[0].member.name).toBe('Bob');
  });
});
