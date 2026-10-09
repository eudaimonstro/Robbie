import { describe, it, expect } from 'vitest';
import {
  calculateStanceBalance,
  canRemoveSelfFromQueue,
  formatWaitTime,
} from '../../utils/index.js';
import type { MeetingState, SpeakerQueueEntry, Member } from '../../types/index.js';

const createMockMember = (overrides: Partial<Member> = {}): Member => ({
  id: 1,
  name: 'Test User',
  role: 'member',
  present: true,
  ...overrides,
});

// Helper to create a minimal meeting state for testing
const createMockState = (overrides: Partial<MeetingState> = {}): MeetingState => ({
  meetingActive: true,
  meetingCode: 'TEST01',
  meetingStage: 'new-business',
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
  speakerTimeLimit: 120, // 2 minutes default
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
  minutesApproved: false,
  minutesFromPreviousMeeting: '',
  committeeReports: [],
  nominationsOpen: false,
  currentNominationPosition: null,
  nominations: [],
  currentElection: null,
  electedOfficers: [],
  inquiries: [],
  debatePositions: {},
  dividedQuestionParts: [],
  rollCall: null,
  ...overrides,
});

describe('calculateStanceBalance', () => {
  it('should count stances correctly', () => {
    const queue: SpeakerQueueEntry[] = [
      { member: createMockMember({ id: 1 }), stance: 'pro' },
      { member: createMockMember({ id: 2 }), stance: 'pro' },
      { member: createMockMember({ id: 3 }), stance: 'con' },
      { member: createMockMember({ id: 4 }), stance: 'neutral' },
    ];

    const balance = calculateStanceBalance(queue);
    expect(balance.pro).toBe(2);
    expect(balance.con).toBe(1);
    expect(balance.neutral).toBe(1);
  });

  it('should report balanced when pro/con differ by at most 1', () => {
    const balancedQueue: SpeakerQueueEntry[] = [
      { member: createMockMember({ id: 1 }), stance: 'pro' },
      { member: createMockMember({ id: 2 }), stance: 'con' },
    ];
    expect(calculateStanceBalance(balancedQueue).isBalanced).toBe(true);

    const offByOne: SpeakerQueueEntry[] = [
      { member: createMockMember({ id: 1 }), stance: 'pro' },
      { member: createMockMember({ id: 2 }), stance: 'pro' },
      { member: createMockMember({ id: 3 }), stance: 'con' },
    ];
    expect(calculateStanceBalance(offByOne).isBalanced).toBe(true);
  });

  it('should report unbalanced when pro/con differ by more than 1', () => {
    const unbalanced: SpeakerQueueEntry[] = [
      { member: createMockMember({ id: 1 }), stance: 'pro' },
      { member: createMockMember({ id: 2 }), stance: 'pro' },
      { member: createMockMember({ id: 3 }), stance: 'pro' },
      { member: createMockMember({ id: 4 }), stance: 'con' },
    ];
    expect(calculateStanceBalance(unbalanced).isBalanced).toBe(false);
  });
});

describe('canRemoveSelfFromQueue', () => {
  it('should return true when member is in queue', () => {
    const member = createMockMember({ id: 1 });
    const state = createMockState({
      speakerQueue: [{ member, stance: 'pro' }],
    });

    expect(canRemoveSelfFromQueue(state, 1)).toBe(true);
  });

  it('should return false when member is not in queue', () => {
    const state = createMockState();
    expect(canRemoveSelfFromQueue(state, 1)).toBe(false);
  });

  it('should return false when member is current speaker', () => {
    const member = createMockMember({ id: 1 });
    const state = createMockState({
      speakerQueue: [{ member, stance: 'pro' }],
      recognizedSpeaker: member,
    });

    expect(canRemoveSelfFromQueue(state, 1)).toBe(false);
  });
});

describe('formatWaitTime', () => {
  it('should format zero seconds as "Now"', () => {
    expect(formatWaitTime(0)).toBe('Now');
    expect(formatWaitTime(-5)).toBe('Now');
  });

  it('should format seconds under a minute', () => {
    expect(formatWaitTime(30)).toBe('30s');
    expect(formatWaitTime(59)).toBe('59s');
  });

  it('should format minutes', () => {
    expect(formatWaitTime(60)).toBe('1min');
    expect(formatWaitTime(120)).toBe('2min');
  });

  it('should format minutes and seconds', () => {
    expect(formatWaitTime(90)).toBe('1min 30s');
    expect(formatWaitTime(150)).toBe('2min 30s');
  });
});
