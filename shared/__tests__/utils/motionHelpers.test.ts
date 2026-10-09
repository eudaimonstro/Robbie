import { MOTIONS } from '../../constants/index.js';
import { describe, it, expect } from 'vitest';
import {
  wordingFixedBy,
  getValidMotions,
  normalizeMotionText,
  isSimilarMotionSubject,
  wasMotionDefeated,
} from '../../utils/index.js';
import type { MeetingState, Motion } from '../../types/index.js';

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
    it('offers a point of order, and never a motion Robbie hides, when nothing is pending', () => {
      const motionKeys = getValidMotions(createMockState()).map((m) => m.key);
      expect(motionKeys).toContain('pointOrder');
      // Questions to the chair are asked of the chair, not moved
      expect(motionKeys).not.toContain('pointInfo');
      expect(motionKeys).not.toContain('questionPrivilege');
      expect(motionKeys).not.toContain('suspendRules');
      expect(motionKeys).not.toContain('fixTimeAdjourn');
    });

    it('should return privileged motions when their precedence is higher', () => {
      const state = createMockState({
        currentMotion: createMockMotion({ precedence: 1 }),
        motionStack: [createMockMotion({ precedence: 1 })],
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map((m) => m.key);
      // Privileged motions with higher precedence should be available
      expect(motionKeys).toContain('adjourn');
      expect(motionKeys).toContain('recess');
    });

    it("doesn't offer amending or dividing a pending bylaw amendment, whose words are its text", () => {
      const bylaw = createMockMotion({
        type: 'bylawAmendment',
        category: 'main',
        precedence: 1,
        bylawAmendment: { documentId: 'd', changeType: 'delete' },
      });
      const keys = getValidMotions(
        createMockState({ currentMotion: bylaw, motionStack: [bylaw] }),
      ).map((m) => m.key);
      expect(keys).not.toContain('amend');
      expect(keys).not.toContain('divideQuestion');
      expect(keys).toContain('adjourn');
      expect(
        wordingFixedBy(createMockState({ currentMotion: bylaw, motionStack: [bylaw] }), 'amend'),
      ).toBe(true);
      // A main motion can still be amended
      const main = createMockMotion({ category: 'main', precedence: 1 });
      expect(
        getValidMotions(createMockState({ currentMotion: main, motionStack: [main] })).map(
          (m) => m.key,
        ),
      ).toContain('amend');
    });

    it('should offer main motions when no motion is pending', () => {
      const motionKeys = getValidMotions(createMockState()).map((m) => m.key);
      expect(motionKeys).toContain('mainMotion');
      expect(motionKeys).toContain('bylawAmendment');
      // Nothing has been tabled, so there is nothing to take from the table
      expect(motionKeys).not.toContain('takeFromTable');
    });

    it('should offer each motion only once', () => {
      const state = createMockState({ agendaAdopted: false, agendaObjection: true });
      const motionKeys = getValidMotions(state).map((m) => m.key);
      expect(new Set(motionKeys).size).toBe(motionKeys.length);
    });

    it('should not offer new business while an agenda objection is unresolved', () => {
      const state = createMockState({ agendaAdopted: false, agendaObjection: true });
      const motionKeys = getValidMotions(state).map((m) => m.key);
      expect(motionKeys).not.toContain('mainMotion');
      expect(motionKeys).not.toContain('bylawAmendment');
    });

    it('never offers take from the table, which Robbie hides, even with a motion tabled', () => {
      const state = createMockState({ tabledMotions: [createMockMotion()] });
      expect(getValidMotions(state).map((m) => m.key)).not.toContain('takeFromTable');
    });

    it('should not offer take from the table while a motion is pending', () => {
      const state = createMockState({
        tabledMotions: [createMockMotion()],
        currentMotion: createMockMotion({ precedence: 1 }),
        motionStack: [createMockMotion({ precedence: 1 })],
      });
      expect(getValidMotions(state).map((m) => m.key)).not.toContain('takeFromTable');
    });

    it('should not offer a bylaw amendment while another motion is pending', () => {
      const state = createMockState({
        currentMotion: createMockMotion({ precedence: 1 }),
        motionStack: [createMockMotion({ precedence: 1 })],
      });
      expect(getValidMotions(state).map((m) => m.key)).not.toContain('bylawAmendment');
    });

    it('should not allow main motion when another motion is pending', () => {
      const state = createMockState({
        currentMotion: createMockMotion({ precedence: 5 }),
        motionStack: [createMockMotion({ precedence: 5 })],
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map((m) => m.key);
      expect(motionKeys).not.toContain('mainMotion');
    });

    it('should include adopt/amend agenda when agenda objection exists', () => {
      const state = createMockState({
        agendaAdopted: false,
        agendaObjection: true,
        currentMotion: null,
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map((m) => m.key);
      expect(motionKeys).toContain('adoptAgenda');
      expect(motionKeys).toContain('amendAgenda');
    });

    it('should not include agenda motions after agenda is adopted', () => {
      const state = createMockState({
        agendaAdopted: true,
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map((m) => m.key);
      expect(motionKeys).not.toContain('adoptAgenda');
    });

    it('should not allow appeal when no chair ruling exists', () => {
      const state = createMockState({
        lastChairRuling: null,
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map((m) => m.key);
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

      const motionKeys = validMotions.map((m) => m.key);
      expect(motionKeys).toContain('appeal');
    });

    it('should allow subsidiary motions when a main motion exists', () => {
      const state = createMockState({
        currentMotion: createMockMotion({ precedence: 1 }),
        motionStack: [createMockMotion({ precedence: 1 })],
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map((m) => m.key);
      // The subsidiary motions Robbie offers, and none it hides
      expect(motionKeys).toContain('amend');
      expect(motionKeys).toContain('previousQuestion');
      expect(motionKeys).toContain('postponeDefinite');
      expect(motionKeys).toContain('postponeIndefinitely');
      expect(motionKeys).toContain('referCommittee');
      expect(motionKeys).not.toContain('layOnTable');
      expect(motionKeys).not.toContain('limitDebate');
    });

    it('should not allow secondary amendment when no primary amendment exists', () => {
      const state = createMockState({
        currentMotion: createMockMotion({ type: 'mainMotion', precedence: 1 }),
        motionStack: [createMockMotion({ type: 'mainMotion', precedence: 1 })],
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map((m) => m.key);
      expect(motionKeys).not.toContain('amendAmendment');
    });

    it('should allow secondary amendment when primary amendment exists', () => {
      // Use the real precedences: amend outranks amendAmendment numerically (3 vs 2.5)
      const mainMotion = createMockMotion({ type: 'mainMotion', precedence: 1 });
      const amendment = createMockMotion({ type: 'amend', precedence: MOTIONS.amend.precedence });

      const state = createMockState({
        currentMotion: amendment,
        motionStack: [mainMotion, amendment],
      });
      const validMotions = getValidMotions(state);

      const motionKeys = validMotions.map((m) => m.key);
      expect(motionKeys).toContain('amendAmendment');
    });

    it('should not allow secondary amendment when the amendment is not the immediately pending question', () => {
      // A motion to close debate on the amendment is pending; it must be dealt with first
      const mainMotion = createMockMotion({ type: 'mainMotion', precedence: 1 });
      const amendment = createMockMotion({ type: 'amend', precedence: MOTIONS.amend.precedence });
      const previousQuestion = createMockMotion({
        type: 'previousQuestion',
        precedence: MOTIONS.previousQuestion.precedence,
      });
      const state = createMockState({
        currentMotion: previousQuestion,
        motionStack: [mainMotion, amendment, previousQuestion],
      });

      expect(getValidMotions(state).map((m) => m.key)).not.toContain('amendAmendment');
    });

    it('never offers reconsider, which Robbie hides', () => {
      const state = createMockState({
        completedMotions: [
          {
            id: 1,
            type: 'mainMotion',
            text: 'Test',
            passed: true,
            voterChoices: { 1: 'yea', 2: 'nay' },
            reconsidered: false,
          },
        ],
      });
      expect(getValidMotions(state).map((m) => m.key)).not.toContain('reconsider');
    });

    it('should keep offering main motions after one is defeated', () => {
      // Only a substantially similar motion is barred; the validator checks the subject
      const state = createMockState({
        defeatedMotions: [{ type: 'mainMotion', text: 'Test', timestamp: '10:00:00' }],
      });
      expect(getValidMotions(state).map((m) => m.key)).toContain('mainMotion');
    });

    it('should not offer a defeated take from the table again', () => {
      const state = createMockState({
        tabledMotions: [createMockMotion()],
        defeatedMotions: [{ type: 'takeFromTable', text: 'Test', timestamp: '10:00:00' }],
      });
      expect(getValidMotions(state).map((m) => m.key)).not.toContain('takeFromTable');
    });
  });

  describe('normalizeMotionText', () => {
    it('should lowercase and trim text', () => {
      expect(normalizeMotionText('  HELLO WORLD  ')).toBe('hello world');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeMotionText('hello    world')).toBe('hello world');
    });

    it('should handle empty string', () => {
      expect(normalizeMotionText('')).toBe('');
    });
  });

  describe('isSimilarMotionSubject', () => {
    it('should return true for identical text', () => {
      expect(isSimilarMotionSubject('approve the budget', 'approve the budget')).toBe(true);
    });

    it('should return true for case-insensitive match', () => {
      expect(isSimilarMotionSubject('Approve the Budget', 'approve the budget')).toBe(true);
    });

    it('should return true when one text contains the other', () => {
      expect(isSimilarMotionSubject('approve the budget', 'approve the budget for 2024')).toBe(
        true,
      );
    });

    it('should return true for 50% or more word overlap', () => {
      // "approve" and "budget" are in both (2 of 4 significant words = 50%)
      expect(isSimilarMotionSubject('approve the budget proposal', 'approve our new budget')).toBe(
        true,
      );
    });

    it('should return false for completely different subjects', () => {
      expect(isSimilarMotionSubject('approve the budget', 'elect new officers')).toBe(false);
    });

    it('should ignore short words (3 chars or less)', () => {
      // Only compares words > 3 characters
      expect(isSimilarMotionSubject('the and for', 'a to is')).toBe(false);
    });
  });

  describe('wasMotionDefeated', () => {
    it('should return false when no defeated motions exist', () => {
      const state = createMockState({ defeatedMotions: [] });
      expect(wasMotionDefeated(state, 'mainMotion', 'test text')).toBe(false);
    });

    it('should return true for exact type match (non-mainMotion)', () => {
      const state = createMockState({
        defeatedMotions: [{ type: 'adjourn', text: 'adjourn', timestamp: '10:00:00' }],
      });
      expect(wasMotionDefeated(state, 'adjourn')).toBe(true);
    });

    it('should return false for different motion type', () => {
      const state = createMockState({
        defeatedMotions: [{ type: 'adjourn', text: 'adjourn', timestamp: '10:00:00' }],
      });
      expect(wasMotionDefeated(state, 'recess')).toBe(false);
    });

    it('should use subject-matter matching for mainMotion type', () => {
      const state = createMockState({
        defeatedMotions: [
          { type: 'mainMotion', text: 'approve the budget proposal', timestamp: '10:00:00' },
        ],
      });
      // Similar subject (both about budget approval)
      expect(wasMotionDefeated(state, 'mainMotion', 'approve our new budget')).toBe(true);
      // Different subject
      expect(wasMotionDefeated(state, 'mainMotion', 'elect new officers')).toBe(false);
    });

    it('should allow mainMotion with different subject even if one was defeated', () => {
      const state = createMockState({
        defeatedMotions: [
          { type: 'mainMotion', text: 'approve the budget', timestamp: '10:00:00' },
        ],
      });
      expect(wasMotionDefeated(state, 'mainMotion', 'schedule a picnic event')).toBe(false);
    });

    describe('bylaw amendments', () => {
      // The motion text is generated from the section label, so it can't tell two different
      // amendments to the same section apart; the proposed change is compared instead
      const text = 'I move to amend the bylaws by modifying Article I "Name"';
      const defeated = {
        documentId: 'doc-1',
        changeType: 'modify' as const,
        targetSectionId: 'sec-1',
        newContent: 'The name shall be  the Old Society.',
      };
      const state = createMockState({
        defeatedMotions: [
          { type: 'bylawAmendment', text, timestamp: '10:00:00', bylawAmendment: defeated },
        ],
      });

      it('should bar the same change again', () => {
        const same = { ...defeated, newContent: 'the name shall be the old society.' };
        expect(wasMotionDefeated(state, 'bylawAmendment', text, same)).toBe(true);
      });

      it('should allow a different change to the same section', () => {
        const different = { ...defeated, newContent: 'The name shall be the New Society.' };
        expect(wasMotionDefeated(state, 'bylawAmendment', text, different)).toBe(false);
      });

      it('should allow the same text applied to a different section', () => {
        const otherSection = { ...defeated, targetSectionId: 'sec-2' };
        expect(wasMotionDefeated(state, 'bylawAmendment', text, otherSection)).toBe(false);
      });

      it('should keep offering bylaw amendments after one is defeated', () => {
        expect(getValidMotions(state).map((m) => m.key)).toContain('bylawAmendment');
      });
    });
  });
});
