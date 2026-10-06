import { describe, it, expect } from 'vitest';
import {
  isRuleSuspended,
  markSingleActionComplete,
  getRuleName,
  getRuleDescription,
  getActiveSuspensions,
  getRuleWarning,
} from '../../utils/index.js';
import type { MeetingState, RuleSuspension } from '../../types/index.js';

// Helper to create a minimal meeting state for testing
const createMockState = (suspendedRules: RuleSuspension[] = []): MeetingState => ({
  suspendedRules,
  // Required fields with minimal values
  meetingActive: true,
  meetingCode: 'TEST01',
  agenda: [],
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

describe('ruleSuspensionHelper', () => {
  describe('isRuleSuspended', () => {
    it('should return false when no rules are suspended', () => {
      const state = createMockState([]);
      expect(isRuleSuspended(state, 'debate-rules')).toBe(false);
    });

    it('should return true for a suspended rule with meeting-remainder scope', () => {
      const state = createMockState([
        {
          id: 1,
          rule: 'debate-rules',
          purpose: 'Emergency',
          specificAction: 'Skip debate',
          scope: 'meeting-remainder',
          suspendedAt: '10:00:00',
          actionCompleted: false,
          motionId: 1,
        },
      ]);
      expect(isRuleSuspended(state, 'debate-rules')).toBe(true);
    });

    it('should return true for single-action suspension that is not completed', () => {
      const state = createMockState([
        {
          id: 1,
          rule: 'motion-precedence',
          purpose: 'Allow out-of-order motion',
          specificAction: 'Consider budget motion',
          scope: 'single-action',
          suspendedAt: '10:00:00',
          actionCompleted: false,
          motionId: 1,
        },
      ]);
      expect(isRuleSuspended(state, 'motion-precedence')).toBe(true);
    });

    it('should return false for single-action suspension that is completed', () => {
      const state = createMockState([
        {
          id: 1,
          rule: 'motion-precedence',
          purpose: 'Allow out-of-order motion',
          specificAction: 'Consider budget motion',
          scope: 'single-action',
          suspendedAt: '10:00:00',
          actionCompleted: true,
          motionId: 1,
        },
      ]);
      expect(isRuleSuspended(state, 'motion-precedence')).toBe(false);
    });

    it('should return false for a different rule', () => {
      const state = createMockState([
        {
          id: 1,
          rule: 'debate-rules',
          purpose: 'Emergency',
          specificAction: 'Skip debate',
          scope: 'meeting-remainder',
          suspendedAt: '10:00:00',
          actionCompleted: false,
          motionId: 1,
        },
      ]);
      expect(isRuleSuspended(state, 'amendment-depth')).toBe(false);
    });
  });

  describe('markSingleActionComplete', () => {
    it('should mark the correct single-action suspension as completed', () => {
      const state = createMockState([
        {
          id: 1,
          rule: 'motion-precedence',
          purpose: 'Test',
          specificAction: 'Test action',
          scope: 'single-action',
          suspendedAt: '10:00:00',
          actionCompleted: false,
          motionId: 1,
        },
      ]);

      const result = markSingleActionComplete(state, 'motion-precedence');
      expect(result[0].actionCompleted).toBe(true);
    });

    it('should not modify meeting-remainder suspensions', () => {
      const state = createMockState([
        {
          id: 1,
          rule: 'debate-rules',
          purpose: 'Test',
          specificAction: 'Test action',
          scope: 'meeting-remainder',
          suspendedAt: '10:00:00',
          actionCompleted: false,
          motionId: 1,
        },
      ]);

      const result = markSingleActionComplete(state, 'debate-rules');
      expect(result[0].actionCompleted).toBe(false);
    });

    it('should not modify other rules', () => {
      const state = createMockState([
        {
          id: 1,
          rule: 'motion-precedence',
          purpose: 'Test',
          specificAction: 'Test action',
          scope: 'single-action',
          suspendedAt: '10:00:00',
          actionCompleted: false,
          motionId: 1,
        },
        {
          id: 2,
          rule: 'amendment-depth',
          purpose: 'Test 2',
          specificAction: 'Test action 2',
          scope: 'single-action',
          suspendedAt: '10:00:00',
          actionCompleted: false,
          motionId: 2,
        },
      ]);

      const result = markSingleActionComplete(state, 'motion-precedence');
      expect(result[0].actionCompleted).toBe(true);
      expect(result[1].actionCompleted).toBe(false);
    });
  });

  describe('getRuleName', () => {
    it('should return correct names for all rules', () => {
      expect(getRuleName('pro-con-alternation')).toBe('Pro/Con Speaker Alternation');
      expect(getRuleName('second-requirement')).toBe('Second Requirement');
      expect(getRuleName('motion-precedence')).toBe('Motion Precedence');
      expect(getRuleName('amendment-depth')).toBe('Amendment Depth Limit');
      expect(getRuleName('motion-renewal')).toBe('Motion Renewal Restriction');
      expect(getRuleName('chair-voting-restriction')).toBe('Chair Voting Restriction');
      expect(getRuleName('motion-maker-priority')).toBe('Motion Maker Priority');
      expect(getRuleName('mover-cannot-second')).toBe('Mover Cannot Second Own Motion');
      expect(getRuleName('debate-rules')).toBe('Debate Rules');
      expect(getRuleName('order-of-business')).toBe('Order of Business');
    });
  });

  describe('getRuleDescription', () => {
    it('should return descriptions for rules', () => {
      expect(getRuleDescription('debate-rules')).toBe('Determines whether motion is debatable');
      expect(getRuleDescription('amendment-depth')).toBe(
        'Limits amendments to 2 levels (primary + secondary)',
      );
    });
  });

  describe('getActiveSuspensions', () => {
    it('should return empty array when no suspensions', () => {
      const state = createMockState([]);
      expect(getActiveSuspensions(state)).toEqual([]);
    });

    it('should return meeting-remainder suspensions', () => {
      const suspension: RuleSuspension = {
        id: 1,
        rule: 'debate-rules',
        purpose: 'Test',
        specificAction: 'Test',
        scope: 'meeting-remainder',
        suspendedAt: '10:00:00',
        actionCompleted: false,
        motionId: 1,
      };
      const state = createMockState([suspension]);
      expect(getActiveSuspensions(state)).toHaveLength(1);
    });

    it('should return incomplete single-action suspensions', () => {
      const suspension: RuleSuspension = {
        id: 1,
        rule: 'motion-precedence',
        purpose: 'Test',
        specificAction: 'Test',
        scope: 'single-action',
        suspendedAt: '10:00:00',
        actionCompleted: false,
        motionId: 1,
      };
      const state = createMockState([suspension]);
      expect(getActiveSuspensions(state)).toHaveLength(1);
    });

    it('should not return completed single-action suspensions', () => {
      const suspension: RuleSuspension = {
        id: 1,
        rule: 'motion-precedence',
        purpose: 'Test',
        specificAction: 'Test',
        scope: 'single-action',
        suspendedAt: '10:00:00',
        actionCompleted: true,
        motionId: 1,
      };
      const state = createMockState([suspension]);
      expect(getActiveSuspensions(state)).toHaveLength(0);
    });
  });

  describe('getRuleWarning', () => {
    it('should return warnings for all rules', () => {
      expect(getRuleWarning('pro-con-alternation')).toContain('Speakers');
      expect(getRuleWarning('debate-rules')).toContain('suspended');
    });
  });
});
