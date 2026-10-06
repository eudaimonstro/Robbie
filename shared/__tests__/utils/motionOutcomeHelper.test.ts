import { describe, it, expect } from 'vitest';
import { applyMotionOutcome } from '../../utils/index.js';
import type { MeetingState, Motion, AgendaItem } from '../../types/index.js';

// Helper to create a minimal meeting state for testing
const createMockState = (overrides: Partial<MeetingState> = {}): MeetingState => ({
  meetingActive: true,
  meetingCode: 'TEST01',
  agenda: [
    { id: 1, title: 'Item 1', status: 'pending' },
    { id: 2, title: 'Item 2', status: 'pending' },
    { id: 3, title: 'Item 3', status: 'pending' },
  ],
  currentAgendaItem: null,
  agendaAdopted: false,
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
  debatePositions: {},
  dividedQuestionParts: [],
  ...overrides,
});

const createMockMotion = (overrides: Partial<Motion> = {}): Motion => ({
  id: 1,
  type: 'mainMotion',
  name: 'Main Motion',
  text: 'Test motion',
  mover: 'Test User',
  moverId: 1,
  precedence: 1,
  debatable: true,
  amendable: true,
  vote: 'majority',
  interrupt: false,
  category: 'main',
  help: 'Test help',
  phrase: 'I move that...',
  status: 'active',
  moverHasSpoken: false,
  ...overrides,
});

describe('applyMotionOutcome', () => {
  describe('default behavior', () => {
    it('should return unchanged values when no special motion type', () => {
      const state = createMockState({
        currentMotion: createMockMotion(),
        motionStack: [createMockMotion()],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.tabledMotions).toEqual([]);
      expect(result.agendaAdopted).toBe(false);
      expect(result.agendaObjection).toBe(false);
      expect(result.newSuspension).toBeNull();
      expect(result.restoredMotion).toBeNull();
      expect(result.objectionKilledMotion).toBeNull();
      expect(result.reconsideredMotionId).toBeNull();
    });
  });

  describe('layOnTable motion', () => {
    it('should table the main motion', () => {
      const mainMotion = createMockMotion({ id: 1, category: 'main' });
      const tableMotion = createMockMotion({ id: 2, type: 'layOnTable', category: 'subsidiary' });

      const state = createMockState({
        currentMotion: tableMotion,
        motionStack: [mainMotion, tableMotion],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.tabledMotions).toHaveLength(1);
      expect(result.tabledMotions[0].id).toBe(1);
    });
  });

  describe('agenda adoption', () => {
    it('should mark agenda as adopted when isAgendaAdoption is true', () => {
      const adoptMotion = createMockMotion({ isAgendaAdoption: true });

      const state = createMockState({
        currentMotion: adoptMotion,
        motionStack: [adoptMotion],
        agendaAdopted: false,
        agendaObjection: true,
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.agendaAdopted).toBe(true);
      expect(result.agendaObjection).toBe(false);
    });
  });

  describe('agenda amendments', () => {
    it('should add item to end of agenda', () => {
      const amendMotion = createMockMotion({
        agendaAmendment: {
          action: 'add',
          title: 'New Item',
          position: 'end',
          itemId: 99,
        },
      });

      const state = createMockState({
        currentMotion: amendMotion,
        motionStack: [amendMotion],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.agenda).toHaveLength(4);
      expect(result.agenda[3].title).toBe('New Item');
      expect(result.agenda[3].id).toBe(99);
    });

    it('should add item to beginning of agenda', () => {
      const amendMotion = createMockMotion({
        agendaAmendment: {
          action: 'add',
          title: 'First Item',
          position: 'beginning',
          itemId: 99,
        },
      });

      const state = createMockState({
        currentMotion: amendMotion,
        motionStack: [amendMotion],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.agenda).toHaveLength(4);
      expect(result.agenda[0].title).toBe('First Item');
    });

    it('should add item at specific position', () => {
      const amendMotion = createMockMotion({
        agendaAmendment: {
          action: 'add',
          title: 'Middle Item',
          position: 1,
          itemId: 99,
        },
      });

      const state = createMockState({
        currentMotion: amendMotion,
        motionStack: [amendMotion],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.agenda).toHaveLength(4);
      expect(result.agenda[1].title).toBe('Middle Item');
      expect(result.agenda[0].title).toBe('Item 1');
      expect(result.agenda[2].title).toBe('Item 2');
    });

    it('should remove item from agenda', () => {
      const amendMotion = createMockMotion({
        agendaAmendment: {
          action: 'remove',
          itemId: 2,
        },
      });

      const state = createMockState({
        currentMotion: amendMotion,
        motionStack: [amendMotion],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.agenda).toHaveLength(2);
      expect(result.agenda.find((i) => i.id === 2)).toBeUndefined();
    });

    it('should reorder agenda items', () => {
      const amendMotion = createMockMotion({
        agendaAmendment: {
          action: 'reorder',
          fromIndex: 0,
          toIndex: 2,
        },
      });

      const state = createMockState({
        currentMotion: amendMotion,
        motionStack: [amendMotion],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.agenda[0].title).toBe('Item 2');
      expect(result.agenda[1].title).toBe('Item 3');
      expect(result.agenda[2].title).toBe('Item 1');
    });
  });

  describe('rule suspension', () => {
    it('should create a new rule suspension', () => {
      const suspendMotion = createMockMotion({
        id: 5,
        type: 'suspendRules',
        ruleSuspension: {
          rule: 'debate-rules',
          purpose: 'Speed up meeting',
          specificAction: 'Skip debate',
          scope: 'meeting-remainder',
        },
      });

      const state = createMockState({
        currentMotion: suspendMotion,
        motionStack: [suspendMotion],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.newSuspension).not.toBeNull();
      expect(result.newSuspension?.rule).toBe('debate-rules');
      expect(result.newSuspension?.purpose).toBe('Speed up meeting');
      expect(result.newSuspension?.scope).toBe('meeting-remainder');
      expect(result.newSuspension?.id).toBe(1);
      expect(result.newSuspension?.suspendedAt).toBe('10:00:00');
    });

    it('should increment suspension ID based on existing suspensions', () => {
      const suspendMotion = createMockMotion({
        id: 5,
        type: 'suspendRules',
        ruleSuspension: {
          rule: 'amendment-depth',
          purpose: 'Allow more amendments',
          specificAction: 'Allow third-level amendment',
          scope: 'single-action',
        },
      });

      const state = createMockState({
        currentMotion: suspendMotion,
        motionStack: [suspendMotion],
        suspendedRules: [
          {
            id: 3,
            rule: 'debate-rules',
            purpose: 'Previous suspension',
            specificAction: 'Previous action',
            scope: 'meeting-remainder',
            suspendedAt: '09:00:00',
            actionCompleted: false,
            motionId: 1,
          },
        ],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.newSuspension?.id).toBe(4);
    });
  });

  describe('take from table', () => {
    it('should restore a tabled motion', () => {
      const tabledMotion = createMockMotion({ id: 10, text: 'Tabled motion' });
      const takeMotion = createMockMotion({
        type: 'takeFromTable',
        tabledMotionId: 10,
      });

      const state = createMockState({
        currentMotion: takeMotion,
        motionStack: [takeMotion],
        tabledMotions: [tabledMotion],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.tabledMotions).toHaveLength(0);
      expect(result.restoredMotion).not.toBeNull();
      expect(result.restoredMotion?.id).toBe(10);
      expect(result.restoredMotion?.status).toBe('active');
    });

    it('should not restore if tabled motion not found', () => {
      const takeMotion = createMockMotion({
        type: 'takeFromTable',
        tabledMotionId: 999, // Non-existent ID
      });

      const state = createMockState({
        currentMotion: takeMotion,
        motionStack: [takeMotion],
        tabledMotions: [createMockMotion({ id: 10 })],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.tabledMotions).toHaveLength(1);
      expect(result.restoredMotion).toBeNull();
    });
  });

  describe('objection to consideration', () => {
    it('should kill the main motion when objection sustained', () => {
      const mainMotion = createMockMotion({ id: 1, category: 'main' });
      const objectionMotion = createMockMotion({ id: 2, type: 'objectionConsideration' });

      const state = createMockState({
        currentMotion: objectionMotion,
        motionStack: [mainMotion, objectionMotion],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.objectionKilledMotion).not.toBeNull();
      expect(result.objectionKilledMotion?.id).toBe(1);
    });
  });

  describe('reconsider', () => {
    it('should set reconsideredMotionId', () => {
      const reconsiderMotion = createMockMotion({
        type: 'reconsider',
        reconsideredMotionId: 42,
      });

      const state = createMockState({
        currentMotion: reconsiderMotion,
        motionStack: [reconsiderMotion],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.reconsideredMotionId).toBe(42);
    });
  });

  describe('divide the question', () => {
    it('should return divided parts when divideQuestion motion has parts', () => {
      const mainMotion = createMockMotion({
        id: 10,
        category: 'main',
        text: 'Original complex motion',
      });
      const divideMotion = createMockMotion({
        id: 20,
        type: 'divideQuestion',
        category: 'incidental',
        dividedParts: ['First part of motion', 'Second part of motion', 'Third part of motion'],
      });

      const state = createMockState({
        currentMotion: divideMotion,
        motionStack: [mainMotion, divideMotion],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.dividedParts).not.toBeNull();
      expect(result.dividedParts).toHaveLength(3);
      expect(result.dividedParts![0].text).toBe('First part of motion');
      expect(result.dividedParts![1].text).toBe('Second part of motion');
      expect(result.dividedParts![2].text).toBe('Third part of motion');
      expect(result.dividedMainMotion).not.toBeNull();
      expect(result.dividedMainMotion!.id).toBe(10);
    });

    it('should return null dividedParts for non-divideQuestion motions', () => {
      const mainMotion = createMockMotion({ id: 10 });

      const state = createMockState({
        currentMotion: mainMotion,
        motionStack: [mainMotion],
      });

      const result = applyMotionOutcome(state, '10:00:00');

      expect(result.dividedParts).toBeNull();
      expect(result.dividedMainMotion).toBeNull();
    });
  });
});
