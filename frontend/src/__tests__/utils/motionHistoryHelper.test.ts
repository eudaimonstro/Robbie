import { describe, it, expect } from 'vitest';
import {
  getMotionHistory,
  filterMotionHistory,
  getMotionTypes,
  getMotionHistoryStats
} from '@robbie/shared/utils';
import type { MeetingState, Motion } from '@robbie/shared/types';

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
  speakerTimeLimit: 120,
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

const createMockMotion = (overrides: Partial<Motion> = {}): Motion => ({
  id: 1,
  type: 'mainMotion',
  name: 'Main Motion',
  text: 'Test motion',
  mover: 'Test User',
  moverId: 1,
  secondedBy: 'Seconder',
  precedence: 1,
  debatable: true,
  amendable: true,
  vote: 'majority',
  interrupt: false,
  needsSecond: true,
  reconsidered: false,
  category: 'main',
  help: 'Test help',
  phrase: 'I move that...',
  status: 'active',
  whenToUse: '',
  ...overrides,
});

describe('getMotionHistory', () => {
  it('should return empty array when no motions', () => {
    const state = createMockState();
    const history = getMotionHistory(state);
    expect(history).toHaveLength(0);
  });

  it('should include completed motions with passed outcome', () => {
    const state = createMockState({
      completedMotions: [{
        id: 1,
        type: 'mainMotion',
        name: 'Main Motion',
        text: 'Approve the budget',
        passed: true,
        voterChoices: { 1: 'yea', 2: 'yea' },
        timestamp: '10:15:00',
        reconsidered: false,
      }],
    });

    const history = getMotionHistory(state);
    expect(history).toHaveLength(1);
    expect(history[0].outcome).toBe('passed');
    expect(history[0].text).toBe('Approve the budget');
    expect(history[0].voteCount?.yea).toBe(2);
  });

  it('should include failed motions', () => {
    const state = createMockState({
      completedMotions: [{
        id: 1,
        type: 'mainMotion',
        name: 'Main Motion',
        text: 'Rejected proposal',
        passed: false,
        voterChoices: { 1: 'nay', 2: 'nay' },
        timestamp: '10:15:00',
        reconsidered: false,
      }],
    });

    const history = getMotionHistory(state);
    expect(history[0].outcome).toBe('failed');
  });

  it('should include tabled motions', () => {
    const state = createMockState({
      tabledMotions: [createMockMotion({ id: 2, text: 'Tabled item' })],
    });

    const history = getMotionHistory(state);
    expect(history).toHaveLength(1);
    expect(history[0].outcome).toBe('tabled');
    expect(history[0].text).toBe('Tabled item');
  });

  it('should include pending motions from stack', () => {
    const state = createMockState({
      motionStack: [createMockMotion({ id: 3, text: 'Current motion' })],
    });

    const history = getMotionHistory(state);
    expect(history).toHaveLength(1);
    expect(history[0].outcome).toBe('pending');
    expect(history[0].text).toBe('Current motion');
  });

  it('should sort pending motions first', () => {
    const state = createMockState({
      completedMotions: [{
        id: 1,
        type: 'mainMotion',
        name: 'Main Motion',
        text: 'Completed motion',
        passed: true,
        voterChoices: {},
        timestamp: '10:00:00',
        reconsidered: false,
      }],
      motionStack: [createMockMotion({ id: 2, text: 'Pending motion' })],
    });

    const history = getMotionHistory(state);
    expect(history[0].outcome).toBe('pending');
    expect(history[1].outcome).toBe('passed');
  });
});

describe('filterMotionHistory', () => {
  const history = [
    { id: 1, type: 'mainMotion', name: 'Main Motion', text: 'Budget proposal', mover: 'Alice', outcome: 'passed' as const, timestamp: '10:00:00' },
    { id: 2, type: 'amend', name: 'Amendment', text: 'Amend budget', mover: 'Bob', outcome: 'failed' as const, timestamp: '10:05:00' },
    { id: 3, type: 'mainMotion', name: 'Main Motion', text: 'New policy', mover: 'Charlie', outcome: 'tabled' as const, timestamp: '10:10:00' },
  ];

  it('should filter by outcome', () => {
    const filtered = filterMotionHistory(history, { outcome: 'passed' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(1);
  });

  it('should filter by type', () => {
    const filtered = filterMotionHistory(history, { type: 'amend' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(2);
  });

  it('should filter by search text in motion text', () => {
    const filtered = filterMotionHistory(history, { searchText: 'budget' });
    expect(filtered).toHaveLength(2);
  });

  it('should filter by search text in mover name', () => {
    const filtered = filterMotionHistory(history, { searchText: 'alice' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].mover).toBe('Alice');
  });

  it('should combine multiple filters', () => {
    const filtered = filterMotionHistory(history, { outcome: 'passed', searchText: 'budget' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(1);
  });

  it('should return all when outcome is "all"', () => {
    const filtered = filterMotionHistory(history, { outcome: 'all' });
    expect(filtered).toHaveLength(3);
  });
});

describe('getMotionTypes', () => {
  it('should return unique motion types', () => {
    const history = [
      { id: 1, type: 'mainMotion', name: 'Main', text: '', mover: '', outcome: 'passed' as const, timestamp: '' },
      { id: 2, type: 'amend', name: 'Amend', text: '', mover: '', outcome: 'passed' as const, timestamp: '' },
      { id: 3, type: 'mainMotion', name: 'Main', text: '', mover: '', outcome: 'failed' as const, timestamp: '' },
    ];

    const types = getMotionTypes(history);
    expect(types).toHaveLength(2);
    expect(types).toContain('mainMotion');
    expect(types).toContain('amend');
  });
});

describe('getMotionHistoryStats', () => {
  it('should calculate correct statistics', () => {
    const history = [
      { id: 1, type: 'mainMotion', name: 'Main', text: '', mover: '', outcome: 'passed' as const, timestamp: '' },
      { id: 2, type: 'mainMotion', name: 'Main', text: '', mover: '', outcome: 'passed' as const, timestamp: '' },
      { id: 3, type: 'mainMotion', name: 'Main', text: '', mover: '', outcome: 'failed' as const, timestamp: '' },
      { id: 4, type: 'mainMotion', name: 'Main', text: '', mover: '', outcome: 'tabled' as const, timestamp: '' },
      { id: 5, type: 'mainMotion', name: 'Main', text: '', mover: '', outcome: 'pending' as const, timestamp: '' },
    ];

    const stats = getMotionHistoryStats(history);
    expect(stats.total).toBe(5);
    expect(stats.passed).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.tabled).toBe(1);
    expect(stats.pending).toBe(1);
  });
});
