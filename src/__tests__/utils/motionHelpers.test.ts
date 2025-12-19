import { describe, it, expect } from 'vitest';
import { getValidMotions } from '../../utils/motionHelpers';
import type { MeetingState, Motion } from '../../types';

// Helper to create a minimal meeting state for testing
const createMockState = (overrides: Partial<MeetingState> = {}): MeetingState => ({
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

describe('motionHelpers', () => {
  describe('getValidMotions', () => {
    it('should return incidental motions when no motion is pending', () => {
      const state = createMockState();
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map(m => m.key);
      // Incidental motions should always be available
      expect(motionKeys).toContain('pointOrder');
      expect(motionKeys).toContain('pointInfo');
    });

    it('should return privileged motions when their precedence is higher', () => {
      const state = createMockState({
        currentMotion: createMockMotion({ precedence: 1 }),
        motionStack: [createMockMotion({ precedence: 1 })],
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map(m => m.key);
      // Privileged motions with higher precedence should be available
      expect(motionKeys).toContain('adjourn');
      expect(motionKeys).toContain('recess');
    });

    it('should not allow main motion when another motion is pending', () => {
      const state = createMockState({
        currentMotion: createMockMotion({ precedence: 5 }),
        motionStack: [createMockMotion({ precedence: 5 })],
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map(m => m.key);
      expect(motionKeys).not.toContain('mainMotion');
    });

    it('should include adopt/amend agenda when agenda objection exists', () => {
      const state = createMockState({
        agendaAdopted: false,
        agendaObjection: true,
        currentMotion: null,
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map(m => m.key);
      expect(motionKeys).toContain('adoptAgenda');
      expect(motionKeys).toContain('amendAgenda');
    });

    it('should not include agenda motions after agenda is adopted', () => {
      const state = createMockState({
        agendaAdopted: true,
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map(m => m.key);
      expect(motionKeys).not.toContain('adoptAgenda');
    });

    it('should not allow appeal when no chair ruling exists', () => {
      const state = createMockState({
        lastChairRuling: null,
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map(m => m.key);
      expect(motionKeys).not.toContain('appeal');
    });

    it('should allow appeal when chair ruling exists', () => {
      const state = createMockState({
        lastChairRuling: {
          ruling: 'Point well taken',
          timestamp: '10:00:00',
          canBeAppealed: true,
        },
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map(m => m.key);
      expect(motionKeys).toContain('appeal');
    });

    it('should allow subsidiary motions when a main motion exists', () => {
      const state = createMockState({
        currentMotion: createMockMotion({ precedence: 1 }),
        motionStack: [createMockMotion({ precedence: 1 })],
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map(m => m.key);
      // Subsidiary motions should be available
      expect(motionKeys).toContain('amend');
      expect(motionKeys).toContain('previousQuestion');
      expect(motionKeys).toContain('layOnTable');
    });

    it('should not allow secondary amendment when no primary amendment exists', () => {
      const state = createMockState({
        currentMotion: createMockMotion({ type: 'mainMotion', precedence: 1 }),
        motionStack: [createMockMotion({ type: 'mainMotion', precedence: 1 })],
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map(m => m.key);
      expect(motionKeys).not.toContain('amendAmendment');
    });

    it('should allow secondary amendment when primary amendment exists', () => {
      const mainMotion = createMockMotion({ type: 'mainMotion', precedence: 1 });
      const amendment = createMockMotion({ type: 'amend', precedence: 2 });

      const state = createMockState({
        currentMotion: amendment,
        motionStack: [mainMotion, amendment],
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map(m => m.key);
      expect(motionKeys).toContain('amendAmendment');
    });

    // Note: reconsider is a "main" category motion, which requires special handling
    // The function validates reconsider eligibility but main motions are handled separately in UI
    it('should not include reconsider in validMotions (main category)', () => {
      const state = createMockState({
        completedMotions: [{
          id: 1,
          type: 'mainMotion',
          text: 'Test',
          passed: true,
          voterChoices: { 1: 'yea' },
          reconsidered: false,
        }],
      });
      // Even with valid reconsider conditions, main motions aren't added to validMotions
      // They're handled through separate UI flows
      const validMotions = getValidMotions(state, 1);
      const motionKeys = validMotions.map(m => m.key);
      expect(motionKeys).not.toContain('reconsider');
    });

    it('should not allow defeated motions to be renewed', () => {
      const state = createMockState({
        defeatedMotions: [{ type: 'mainMotion', text: 'Test', timestamp: '10:00:00' }],
      });
      const validMotions = getValidMotions(state);

      // Main motion category motions that were defeated should not appear
      const mainMotions = validMotions.filter(m => m.category === 'main' && m.key === 'mainMotion');
      expect(mainMotions).toHaveLength(0);
    });
  });
});
