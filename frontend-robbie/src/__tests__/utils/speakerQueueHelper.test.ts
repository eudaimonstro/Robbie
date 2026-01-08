import { describe, it, expect } from 'vitest';
import {
  getMemberQueueInfo,
  calculateStanceBalance,
  getQueueStats,
  canRemoveSelfFromQueue,
  formatWaitTime,
  getNextSpeakerInfo
} from '@robbie-bylawyer/shared/utils';
import type { MeetingState, SpeakerQueueEntry, Member } from '@robbie-bylawyer/shared/types';

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
  suspendedRules: [],
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

describe('getMemberQueueInfo', () => {
  it('should return null when member not in queue', () => {
    const state = createMockState();
    const info = getMemberQueueInfo(state, 1);
    expect(info).toBeNull();
  });

  it('should return position 1 for first in queue', () => {
    const member = createMockMember({ id: 1 });
    const state = createMockState({
      speakerQueue: [{ member, stance: 'pro' }],
    });

    const info = getMemberQueueInfo(state, 1);
    expect(info?.position).toBe(1);
  });

  it('should calculate estimated wait time based on position', () => {
    const member1 = createMockMember({ id: 1, name: 'First' });
    const member2 = createMockMember({ id: 2, name: 'Second' });
    const state = createMockState({
      speakerQueue: [
        { member: member1, stance: 'pro' },
        { member: member2, stance: 'con' },
      ],
      speakerTimeLimit: 60, // 60 seconds
    });

    const info = getMemberQueueInfo(state, 2);
    expect(info?.position).toBe(2);
    expect(info?.estimatedWaitSeconds).toBe(60); // One person ahead * 60 seconds
  });

  it('should indicate willSpeakNext when first and no current speaker', () => {
    const member = createMockMember({ id: 1 });
    const state = createMockState({
      speakerQueue: [{ member, stance: 'pro' }],
      recognizedSpeaker: null,
    });

    const info = getMemberQueueInfo(state, 1);
    expect(info?.willSpeakNext).toBe(true);
  });
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

describe('getQueueStats', () => {
  it('should return correct queue statistics', () => {
    const state = createMockState({
      speakerQueue: [
        { member: createMockMember({ id: 1 }), stance: 'pro' },
        { member: createMockMember({ id: 2 }), stance: 'con' },
      ],
      speakerTimeLimit: 60,
    });

    const stats = getQueueStats(state);
    expect(stats.totalInQueue).toBe(2);
    expect(stats.estimatedTotalTime).toBe(120); // 2 * 60
    expect(stats.currentSpeakerRemaining).toBeNull();
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

describe('getNextSpeakerInfo', () => {
  it('should return null when queue is empty', () => {
    const state = createMockState();
    const info = getNextSpeakerInfo(state);
    expect(info.nextSpeaker).toBeNull();
  });

  it('should return first speaker when no alternation rule', () => {
    const member1 = createMockMember({ id: 1, name: 'First' });
    const member2 = createMockMember({ id: 2, name: 'Second' });
    const state = createMockState({
      speakerQueue: [
        { member: member1, stance: 'pro' },
        { member: member2, stance: 'con' },
      ],
      suspendedRules: [{
        id: 1,
        rule: 'pro-con-alternation',
        purpose: 'Test',
        specificAction: '',
        scope: 'meeting-remainder',
        suspendedAt: '10:00:00',
        motionId: 1,
      }],
    });

    const info = getNextSpeakerInfo(state);
    expect(info.nextSpeaker?.member.name).toBe('First');
    expect(info.isAlternating).toBe(false);
  });

  it('should prefer opposite stance when alternation is active', () => {
    const proMember = createMockMember({ id: 1, name: 'Pro Speaker' });
    const conMember = createMockMember({ id: 2, name: 'Con Speaker' });
    const state = createMockState({
      speakerQueue: [
        { member: proMember, stance: 'pro' },
        { member: conMember, stance: 'con' },
      ],
      lastSpeakerStance: 'pro', // Last was pro, so prefer con
      suspendedRules: [], // No rule suspended, alternation active
    });

    const info = getNextSpeakerInfo(state);
    expect(info.isAlternating).toBe(true);
    expect(info.preferredStance).toBe('con');
    expect(info.nextSpeaker?.member.name).toBe('Con Speaker');
  });
});
