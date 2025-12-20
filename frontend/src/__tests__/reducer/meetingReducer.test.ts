import { describe, it, expect } from 'vitest';
import { meetingReducer, initialState } from '@eudaimonstro/robbie-shared/reducer';
import type { MeetingState, Motion } from '@eudaimonstro/robbie-shared/types';

// Helper to create a basic motion
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

describe('meetingReducer', () => {
  describe('START_MEETING', () => {
    it('should start the meeting', () => {
      const state = meetingReducer(initialState, {
        type: 'START_MEETING',
        meetingCode: 'ABC123',
        timestamp: '10:00:00',
      });

      expect(state.meetingActive).toBe(true);
      expect(state.meetingCode).toBe('ABC123');
      expect(state.meetingStage).toBe('call-to-order');
    });

    it('should add a log entry', () => {
      const state = meetingReducer(initialState, {
        type: 'START_MEETING',
        meetingCode: 'ABC123',
        timestamp: '10:00:00',
      });

      expect(state.meetingLog.length).toBeGreaterThan(0);
      expect(state.meetingLog[0].message).toContain('Meeting called to order');
    });
  });

  describe('END_MEETING', () => {
    it('should end the meeting', () => {
      const activeState: MeetingState = {
        ...initialState,
        meetingActive: true,
        meetingCode: 'ABC123',
      };

      const state = meetingReducer(activeState, {
        type: 'END_MEETING',
        timestamp: '11:00:00',
      });

      expect(state.meetingActive).toBe(false);
      expect(state.meetingStage).toBe('adjourned');
    });
  });

  describe('MAKE_MOTION', () => {
    it('should create a pending second for a regular motion', () => {
      const activeState: MeetingState = {
        ...initialState,
        meetingActive: true,
        agendaAdopted: true,
      };

      const state = meetingReducer(activeState, {
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: 'I move to approve the budget',
        mover: 'John',
        moverId: 1,
        motionId: 123,
        timestamp: '10:05:00',
      });

      expect(state.pendingSecond).not.toBeNull();
      expect(state.pendingSecond?.text).toBe('I move to approve the budget');
      expect(state.pendingSecond?.mover).toBe('John');
    });
  });

  describe('SECOND_MOTION', () => {
    it('should move pendingSecond to currentMotion', () => {
      const stateWithPending: MeetingState = {
        ...initialState,
        meetingActive: true,
        pendingSecond: createMockMotion({ text: 'Test motion' }),
      };

      const state = meetingReducer(stateWithPending, {
        type: 'SECOND_MOTION',
        seconder: 'Jane',
        timestamp: '10:06:00',
      });

      expect(state.pendingSecond).toBeNull();
      expect(state.currentMotion).not.toBeNull();
      expect(state.currentMotion?.text).toBe('Test motion');
      expect(state.motionStack.length).toBe(1);
    });
  });

  describe('DECLINE_SECOND', () => {
    it('should clear pending second when no second received', () => {
      const stateWithPending: MeetingState = {
        ...initialState,
        meetingActive: true,
        pendingSecond: createMockMotion(),
      };

      const state = meetingReducer(stateWithPending, {
        type: 'DECLINE_SECOND',
        timestamp: '10:06:00',
      });

      expect(state.pendingSecond).toBeNull();
    });
  });

  describe('CAST_VOTE', () => {
    it('should record a yea vote', () => {
      const votingState: MeetingState = {
        ...initialState,
        meetingActive: true,
        votingOpen: true,
        currentMotion: createMockMotion(),
        motionStack: [createMockMotion()],
      };

      const state = meetingReducer(votingState, {
        type: 'CAST_VOTE',
        vote: 'yea',
        voterId: 1,
      });

      expect(state.votes.yea).toBe(1);
      expect(state.voters).toContain(1);
      expect(state.voterChoices[1]).toBe('yea');
    });

    it('should record a nay vote', () => {
      const votingState: MeetingState = {
        ...initialState,
        meetingActive: true,
        votingOpen: true,
        currentMotion: createMockMotion(),
        motionStack: [createMockMotion()],
      };

      const state = meetingReducer(votingState, {
        type: 'CAST_VOTE',
        vote: 'nay',
        voterId: 2,
      });

      expect(state.votes.nay).toBe(1);
      expect(state.voters).toContain(2);
    });

    it('should allow changing vote', () => {
      const votingState: MeetingState = {
        ...initialState,
        meetingActive: true,
        votingOpen: true,
        currentMotion: createMockMotion(),
        motionStack: [createMockMotion()],
        votes: { yea: 1, nay: 0, abstain: 0 },
        voters: [1],
        voterChoices: { 1: 'yea' },
      };

      const state = meetingReducer(votingState, {
        type: 'CAST_VOTE',
        vote: 'nay',
        voterId: 1,
      });

      expect(state.votes.yea).toBe(0);
      expect(state.votes.nay).toBe(1);
      expect(state.voterChoices[1]).toBe('nay');
    });
  });

  describe('OPEN_VOTING', () => {
    it('should open voting and reset vote counts', () => {
      const stateWithMotion: MeetingState = {
        ...initialState,
        meetingActive: true,
        currentMotion: createMockMotion(),
        motionStack: [createMockMotion()],
        votes: { yea: 5, nay: 3, abstain: 1 },
      };

      const state = meetingReducer(stateWithMotion, {
        type: 'OPEN_VOTING',
        timestamp: '10:10:00',
        voteTimerEnd: null,
      });

      expect(state.votingOpen).toBe(true);
      expect(state.votes).toEqual({ yea: 0, nay: 0, abstain: 0 });
      expect(state.voters).toEqual([]);
      expect(state.voterChoices).toEqual({});
    });
  });

  describe('CLOSE_VOTING', () => {
    it('should close voting and determine result - motion passes', () => {
      const votingState: MeetingState = {
        ...initialState,
        meetingActive: true,
        votingOpen: true,
        currentMotion: createMockMotion({ vote: 'majority' }),
        motionStack: [createMockMotion({ vote: 'majority' })],
        votes: { yea: 6, nay: 4, abstain: 0 },
      };

      const state = meetingReducer(votingState, {
        type: 'CLOSE_VOTING',
        timestamp: '10:15:00',
      });

      expect(state.votingOpen).toBe(false);
      expect(state.currentMotion).toBeNull();
      expect(state.meetingLog.some(l => l.message.includes('CARRIED'))).toBe(true);
    });

    it('should close voting and determine result - motion fails', () => {
      const votingState: MeetingState = {
        ...initialState,
        meetingActive: true,
        votingOpen: true,
        currentMotion: createMockMotion({ vote: 'majority' }),
        motionStack: [createMockMotion({ vote: 'majority' })],
        votes: { yea: 4, nay: 6, abstain: 0 },
      };

      const state = meetingReducer(votingState, {
        type: 'CLOSE_VOTING',
        timestamp: '10:15:00',
      });

      expect(state.votingOpen).toBe(false);
      expect(state.meetingLog.some(l => l.message.includes('FAILED'))).toBe(true);
    });

    it('should handle 2/3 vote requirement', () => {
      const votingState: MeetingState = {
        ...initialState,
        meetingActive: true,
        votingOpen: true,
        currentMotion: createMockMotion({ vote: '2/3' }),
        motionStack: [createMockMotion({ vote: '2/3' })],
        votes: { yea: 6, nay: 4, abstain: 0 }, // 60% - not enough for 2/3
      };

      const state = meetingReducer(votingState, {
        type: 'CLOSE_VOTING',
        timestamp: '10:15:00',
      });

      expect(state.meetingLog.some(l => l.message.includes('FAILED'))).toBe(true);
    });
  });

  describe('RAISE_HAND', () => {
    it('should add member to speaker queue', () => {
      const member = initialState.members[0];
      const state = meetingReducer(initialState, {
        type: 'RAISE_HAND',
        member,
        stance: 'pro',
      });

      expect(state.speakerQueue.length).toBe(1);
      expect(state.speakerQueue[0].member.id).toBe(member.id);
      expect(state.speakerQueue[0].stance).toBe('pro');
    });

    it('should not add duplicate member', () => {
      const member = initialState.members[0];
      const stateWithHand: MeetingState = {
        ...initialState,
        speakerQueue: [{ member, stance: 'pro' }],
      };

      const state = meetingReducer(stateWithHand, {
        type: 'RAISE_HAND',
        member,
        stance: 'con',
      });

      expect(state.speakerQueue.length).toBe(1);
    });
  });

  describe('LOWER_HAND', () => {
    it('should remove member from speaker queue', () => {
      const member = initialState.members[0];
      const stateWithHand: MeetingState = {
        ...initialState,
        speakerQueue: [{ member, stance: 'pro' }],
      };

      const state = meetingReducer(stateWithHand, {
        type: 'LOWER_HAND',
        member,
      });

      expect(state.speakerQueue.length).toBe(0);
    });
  });

  describe('RECOGNIZE_SPEAKER', () => {
    it('should set recognized speaker and remove from queue', () => {
      const member = initialState.members[0];
      const stateWithHand: MeetingState = {
        ...initialState,
        speakerQueue: [{ member, stance: 'pro' }],
      };

      const state = meetingReducer(stateWithHand, {
        type: 'RECOGNIZE_SPEAKER',
        member,
        stance: 'pro',
        speakerTimerEnd: null,
        timestamp: '10:20:00',
      });

      expect(state.recognizedSpeaker).toEqual(member);
      expect(state.speakerQueue.length).toBe(0);
      expect(state.lastSpeakerStance).toBe('pro');
    });
  });

  describe('YIELD_FLOOR', () => {
    it('should clear recognized speaker', () => {
      const member = initialState.members[0];
      const stateWithSpeaker: MeetingState = {
        ...initialState,
        recognizedSpeaker: member,
      };

      const state = meetingReducer(stateWithSpeaker, {
        type: 'YIELD_FLOOR',
        timestamp: '10:25:00',
      });

      expect(state.recognizedSpeaker).toBeNull();
    });
  });

  describe('ADOPT_AGENDA', () => {
    it('should mark agenda as adopted', () => {
      const state = meetingReducer(initialState, {
        type: 'ADOPT_AGENDA',
        timestamp: '10:05:00',
      });

      expect(state.agendaAdopted).toBe(true);
      expect(state.agendaObjection).toBe(false);
    });
  });

  describe('AGENDA_OBJECTION', () => {
    it('should record agenda objection', () => {
      const state = meetingReducer(initialState, {
        type: 'AGENDA_OBJECTION',
        timestamp: '10:05:00',
      });

      expect(state.agendaObjection).toBe(true);
    });
  });

  describe('ADD_AGENDA_ITEM', () => {
    it('should add a new agenda item', () => {
      const initialLength = initialState.agenda.length;

      const state = meetingReducer(initialState, {
        type: 'ADD_AGENDA_ITEM',
        title: 'New Business Item',
        itemId: 999,
      });

      expect(state.agenda.length).toBe(initialLength + 1);
      expect(state.agenda[state.agenda.length - 1].title).toBe('New Business Item');
    });
  });

  describe('ADVANCE_MEETING_STAGE', () => {
    it('should advance to the next meeting stage', () => {
      const activeState: MeetingState = {
        ...initialState,
        meetingActive: true,
        meetingStage: 'call-to-order',
      };

      const state = meetingReducer(activeState, {
        type: 'ADVANCE_MEETING_STAGE',
        timestamp: '10:10:00',
      });

      expect(state.meetingStage).toBe('minutes-approval');
    });
  });

  describe('REQUEST_UNANIMOUS_CONSENT', () => {
    it('should set unanimous consent pending', () => {
      const stateWithMotion: MeetingState = {
        ...initialState,
        meetingActive: true,
        currentMotion: createMockMotion(),
        motionStack: [createMockMotion()],
      };

      const state = meetingReducer(stateWithMotion, {
        type: 'REQUEST_UNANIMOUS_CONSENT',
        timestamp: '10:10:00',
      });

      expect(state.unanimousConsentPending).toBe(true);
    });
  });

  describe('OBJECT_TO_CONSENT', () => {
    it('should cancel unanimous consent and add to log', () => {
      const stateWithConsent: MeetingState = {
        ...initialState,
        meetingActive: true,
        unanimousConsentPending: true,
        currentMotion: createMockMotion(),
        motionStack: [createMockMotion()],
      };

      const state = meetingReducer(stateWithConsent, {
        type: 'OBJECT_TO_CONSENT',
        objector: 'John',
        timestamp: '10:12:00',
      });

      expect(state.unanimousConsentPending).toBe(false);
      expect(state.meetingLog.some(l => l.message.includes('objects'))).toBe(true);
    });
  });

  describe('SET_SPEAKER_TIME_LIMIT', () => {
    it('should update speaker time limit', () => {
      const state = meetingReducer(initialState, {
        type: 'SET_SPEAKER_TIME_LIMIT',
        seconds: 180,
      });

      expect(state.speakerTimeLimit).toBe(180);
    });
  });

  describe('SET_VOTE_TIME_LIMIT', () => {
    it('should update vote time limit', () => {
      const state = meetingReducer(initialState, {
        type: 'SET_VOTE_TIME_LIMIT',
        seconds: 90,
      });

      expect(state.voteTimeLimit).toBe(90);
    });
  });

  describe('UNANIMOUS_CONSENT_PASSED', () => {
    it('should pass motion without vote', () => {
      const stateWithConsent: MeetingState = {
        ...initialState,
        meetingActive: true,
        unanimousConsentPending: true,
        currentMotion: createMockMotion(),
        motionStack: [createMockMotion()],
      };

      const state = meetingReducer(stateWithConsent, {
        type: 'UNANIMOUS_CONSENT_PASSED',
        timestamp: '10:12:00',
      });

      expect(state.unanimousConsentPending).toBe(false);
      expect(state.currentMotion).toBeNull();
      expect(state.meetingLog.some(l => l.message.includes('unanimous consent'))).toBe(true);
    });
  });

  describe('CALL_AGENDA_ITEM', () => {
    it('should set current agenda item', () => {
      const stateWithAgenda: MeetingState = {
        ...initialState,
        meetingActive: true,
        agendaAdopted: true,
        agenda: [
          { id: 1, title: 'First Item', status: 'pending' },
          { id: 2, title: 'Second Item', status: 'pending' },
        ],
      };

      const state = meetingReducer(stateWithAgenda, {
        type: 'CALL_AGENDA_ITEM',
        id: 2,
        timestamp: '10:15:00',
      });

      expect(state.currentAgendaItem?.id).toBe(2);
      expect(state.agenda.find(a => a.id === 2)?.status).toBe('active');
    });
  });

  describe('COMPLETE_AGENDA_ITEM', () => {
    it('should mark agenda item as completed', () => {
      const stateWithItem: MeetingState = {
        ...initialState,
        meetingActive: true,
        agendaAdopted: true,
        agenda: [
          { id: 1, title: 'First Item', status: 'active' },
        ],
        currentAgendaItem: { id: 1, title: 'First Item', status: 'active' },
      };

      const state = meetingReducer(stateWithItem, {
        type: 'COMPLETE_AGENDA_ITEM',
        id: 1,
        timestamp: '10:20:00',
      });

      expect(state.currentAgendaItem).toBeNull();
      expect(state.agenda.find(a => a.id === 1)?.status).toBe('completed');
    });
  });

  describe('REORDER_AGENDA', () => {
    it('should reorder agenda items', () => {
      const stateWithAgenda: MeetingState = {
        ...initialState,
        agenda: [
          { id: 1, title: 'First', status: 'pending' },
          { id: 2, title: 'Second', status: 'pending' },
          { id: 3, title: 'Third', status: 'pending' },
        ],
      };

      const state = meetingReducer(stateWithAgenda, {
        type: 'REORDER_AGENDA',
        fromIndex: 0,
        toIndex: 2,
      });

      expect(state.agenda[0].id).toBe(2);
      expect(state.agenda[1].id).toBe(3);
      expect(state.agenda[2].id).toBe(1);
    });
  });

  describe('SET_VOTING_METHOD', () => {
    it('should set voting method to ballot', () => {
      const state = meetingReducer(initialState, {
        type: 'SET_VOTING_METHOD',
        method: 'ballot',
      });

      expect(state.votingMethod).toBe('ballot');
    });

    it('should set voting method to rollcall', () => {
      const state = meetingReducer(initialState, {
        type: 'SET_VOTING_METHOD',
        method: 'rollcall',
      });

      expect(state.votingMethod).toBe('rollcall');
    });
  });

  describe('APPROVE_MINUTES', () => {
    it('should mark minutes as approved', () => {
      const state = meetingReducer(initialState, {
        type: 'APPROVE_MINUTES',
        timestamp: '10:05:00',
      });

      expect(state.minutesApproved).toBe(true);
    });
  });

  describe('CHAIR_RULING', () => {
    it('should record chair ruling for sustain', () => {
      const stateWithPointOfOrder: MeetingState = {
        ...initialState,
        meetingActive: true,
        currentMotion: createMockMotion({ type: 'pointOrder', vote: 'none' }),
        motionStack: [createMockMotion({ type: 'pointOrder', vote: 'none' })],
      };

      const state = meetingReducer(stateWithPointOfOrder, {
        type: 'CHAIR_RULING',
        ruling: 'sustain',
        timestamp: '10:10:00',
      });

      expect(state.lastChairRuling).not.toBeNull();
      expect(state.lastChairRuling?.ruling).toContain('well taken');
      expect(state.currentMotion).toBeNull();
    });
  });

  describe('REMOVE_AGENDA_ITEM', () => {
    it('should remove agenda item', () => {
      const stateWithAgenda: MeetingState = {
        ...initialState,
        agenda: [
          { id: 1, title: 'First', status: 'pending' },
          { id: 2, title: 'Second', status: 'pending' },
        ],
      };

      const state = meetingReducer(stateWithAgenda, {
        type: 'REMOVE_AGENDA_ITEM',
        id: 1,
      });

      expect(state.agenda).toHaveLength(1);
      expect(state.agenda[0].id).toBe(2);
    });
  });

  describe('SET_PREVIOUS_MINUTES', () => {
    it('should set minutes from previous meeting', () => {
      const state = meetingReducer(initialState, {
        type: 'SET_PREVIOUS_MINUTES',
        minutes: 'Minutes from last meeting...',
      });

      expect(state.minutesFromPreviousMeeting).toBe('Minutes from last meeting...');
    });
  });

  describe('ADD_COMMITTEE_REPORT', () => {
    it('should add committee report', () => {
      const stateWithoutReports: MeetingState = {
        ...initialState,
        committeeReports: [],
      };
      const report = {
        id: 1,
        committee: 'Finance',
        presenter: 'Jane Doe',
        summary: 'The budget is balanced.',
        recommendations: 'Continue current spending levels.',
        presented: false,
      };

      const state = meetingReducer(stateWithoutReports, {
        type: 'ADD_COMMITTEE_REPORT',
        report,
      });

      expect(state.committeeReports).toHaveLength(1);
      expect(state.committeeReports[0].committee).toBe('Finance');
    });
  });

  describe('PRESENT_COMMITTEE_REPORT', () => {
    it('should mark report as presented', () => {
      const stateWithReport: MeetingState = {
        ...initialState,
        committeeReports: [{
          id: 1,
          committee: 'Finance',
          presenter: 'Jane Doe',
          content: 'Report content',
          recommendations: 'Some recommendations',
          presented: false,
        }],
      };

      const state = meetingReducer(stateWithReport, {
        type: 'PRESENT_COMMITTEE_REPORT',
        reportId: 1,
        timestamp: '10:15:00',
      });

      expect(state.committeeReports[0].presented).toBe(true);
      expect(state.meetingLog.some(l => l.message.includes('Finance'))).toBe(true);
    });

    it('should return unchanged state if report not found', () => {
      const state = meetingReducer(initialState, {
        type: 'PRESENT_COMMITTEE_REPORT',
        reportId: 999,
        timestamp: '10:15:00',
      });

      expect(state).toBe(initialState);
    });
  });

  describe('SUSPEND_RULE_APPROVED', () => {
    it('should add rule suspension', () => {
      const suspension = {
        id: 1,
        rule: 'debate-rules' as const,
        purpose: 'Speed up meeting',
        specificAction: 'Limit debate to 5 minutes',
        scope: 'meeting-remainder' as const,
        suspendedAt: '10:20:00',
        actionCompleted: false,
        motionId: 5,
      };

      const state = meetingReducer(initialState, {
        type: 'SUSPEND_RULE_APPROVED',
        suspension,
        timestamp: '10:20:00',
      });

      expect(state.suspendedRules).toHaveLength(1);
      expect(state.suspendedRules[0].rule).toBe('debate-rules');
    });
  });

  describe('RESTORE_RULE', () => {
    it('should remove rule suspension', () => {
      const stateWithSuspension: MeetingState = {
        ...initialState,
        suspendedRules: [{
          id: 1,
          rule: 'debate-rules',
          purpose: 'Speed up meeting',
          specificAction: 'Limit debate',
          scope: 'meeting-remainder',
          suspendedAt: '10:20:00',
          actionCompleted: false,
          motionId: 5,
        }],
      };

      const state = meetingReducer(stateWithSuspension, {
        type: 'RESTORE_RULE',
        suspensionId: 1,
        timestamp: '10:30:00',
      });

      expect(state.suspendedRules).toHaveLength(0);
      expect(state.meetingLog.some(l => l.message.includes('RULE RESTORED'))).toBe(true);
    });

    it('should handle non-existent suspension ID', () => {
      const state = meetingReducer(initialState, {
        type: 'RESTORE_RULE',
        suspensionId: 999,
        timestamp: '10:30:00',
      });

      expect(state.suspendedRules).toHaveLength(0);
    });
  });

  describe('OPEN_NOMINATIONS', () => {
    it('should open nominations for position', () => {
      const state = meetingReducer(initialState, {
        type: 'OPEN_NOMINATIONS',
        position: 'President',
        timestamp: '10:30:00',
      });

      expect(state.nominationsOpen).toBe(true);
      expect(state.currentNominationPosition).toBe('President');
    });
  });

  describe('NOMINATE', () => {
    it('should add nomination', () => {
      const stateWithNominations: MeetingState = {
        ...initialState,
        nominationsOpen: true,
        currentNominationPosition: 'President',
      };

      const state = meetingReducer(stateWithNominations, {
        type: 'NOMINATE',
        position: 'President',
        nomineeName: 'John Smith',
        nomineeId: 2,
        nominatedBy: 'Jane Doe',
        nominatorId: 1,
        nominationId: 1,
        timestamp: '10:32:00',
      });

      expect(state.nominations).toHaveLength(1);
      expect(state.nominations[0].nomineeName).toBe('John Smith');
      expect(state.nominations[0].nominatedBy).toBe('Jane Doe');
    });
  });

  describe('DECLINE_NOMINATION', () => {
    it('should mark nomination as declined', () => {
      const stateWithNomination: MeetingState = {
        ...initialState,
        nominations: [{
          id: 1,
          position: 'President',
          nomineeName: 'John Smith',
          nomineeId: 2,
          nominatedBy: 'Jane Doe',
          nominatorId: 1,
          timestamp: '10:32:00',
          declined: false,
        }],
      };

      const state = meetingReducer(stateWithNomination, {
        type: 'DECLINE_NOMINATION',
        nominationId: 1,
        timestamp: '10:33:00',
      });

      expect(state.nominations[0].declined).toBe(true);
    });

    it('should return unchanged state if nomination not found', () => {
      const state = meetingReducer(initialState, {
        type: 'DECLINE_NOMINATION',
        nominationId: 999,
        timestamp: '10:33:00',
      });

      expect(state).toBe(initialState);
    });
  });

  describe('CLOSE_NOMINATIONS', () => {
    it('should close nominations', () => {
      const stateWithNominations: MeetingState = {
        ...initialState,
        nominationsOpen: true,
        currentNominationPosition: 'President',
      };

      const state = meetingReducer(stateWithNominations, {
        type: 'CLOSE_NOMINATIONS',
        timestamp: '10:35:00',
      });

      expect(state.nominationsOpen).toBe(false);
    });
  });

  describe('START_ELECTION', () => {
    it('should start election with candidates', () => {
      const stateWithNominations: MeetingState = {
        ...initialState,
        nominationsOpen: false,
        currentNominationPosition: 'President',
        nominations: [
          { id: 1, position: 'President', nomineeName: 'Alice', nomineeId: 1, nominatedBy: 'Bob', nominatorId: 2, timestamp: '10:32:00', declined: false },
          { id: 2, position: 'President', nomineeName: 'Charlie', nomineeId: 3, nominatedBy: 'Bob', nominatorId: 2, timestamp: '10:33:00', declined: false },
          { id: 3, position: 'President', nomineeName: 'Dave', nomineeId: 4, nominatedBy: 'Bob', nominatorId: 2, timestamp: '10:34:00', declined: true },
        ],
      };

      const state = meetingReducer(stateWithNominations, {
        type: 'START_ELECTION',
        position: 'President',
        requiredVotes: 'majority',
        electionId: 1,
        timestamp: '10:40:00',
      });

      expect(state.currentElection).not.toBeNull();
      expect(state.currentElection?.candidates).toHaveLength(2); // Declined nomination excluded
      expect(state.currentElection?.votingInProgress).toBe(true);
    });
  });

  describe('CAST_BALLOT', () => {
    it('should record ballot vote', () => {
      const stateWithElection: MeetingState = {
        ...initialState,
        currentElection: {
          id: 1,
          position: 'President',
          candidates: [{ name: 'Alice', id: 1 }, { name: 'Charlie', id: 3 }],
          requiredVotes: 'majority',
          votingInProgress: true,
          ballotResults: { Alice: 0, Charlie: 0 },
          votersWhoVoted: [],
          elected: null,
        },
      };

      const state = meetingReducer(stateWithElection, {
        type: 'CAST_BALLOT',
        candidateName: 'Alice',
        voterId: 5,
      });

      expect(state.currentElection?.ballotResults.Alice).toBe(1);
      expect(state.currentElection?.votersWhoVoted).toContain(5);
    });

    it('should prevent duplicate voting', () => {
      const stateWithElection: MeetingState = {
        ...initialState,
        currentElection: {
          id: 1,
          position: 'President',
          candidates: [{ name: 'Alice', id: 1 }],
          requiredVotes: 'majority',
          votingInProgress: true,
          ballotResults: { Alice: 1 },
          votersWhoVoted: [5],
          elected: null,
        },
      };

      const state = meetingReducer(stateWithElection, {
        type: 'CAST_BALLOT',
        candidateName: 'Alice',
        voterId: 5, // Already voted
      });

      expect(state.currentElection?.ballotResults.Alice).toBe(1); // Unchanged
    });

    it('should return unchanged if no election', () => {
      const state = meetingReducer(initialState, {
        type: 'CAST_BALLOT',
        candidateName: 'Alice',
        voterId: 5,
      });

      expect(state).toBe(initialState);
    });
  });

  describe('CLOSE_ELECTION', () => {
    it('should declare winner with majority', () => {
      const stateWithElection: MeetingState = {
        ...initialState,
        currentElection: {
          id: 1,
          position: 'President',
          candidates: [{ name: 'Alice', id: 1 }, { name: 'Charlie', id: 3 }],
          requiredVotes: 'majority',
          votingInProgress: true,
          ballotResults: { Alice: 6, Charlie: 4 },
          votersWhoVoted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          elected: null,
        },
      };

      const state = meetingReducer(stateWithElection, {
        type: 'CLOSE_ELECTION',
        timestamp: '10:50:00',
      });

      expect(state.currentElection?.votingInProgress).toBe(false);
      expect(state.currentElection?.elected).toBe('Alice');
    });

    it('should not declare winner if majority not reached', () => {
      const stateWithElection: MeetingState = {
        ...initialState,
        currentElection: {
          id: 1,
          position: 'President',
          candidates: [{ name: 'Alice', id: 1 }, { name: 'Charlie', id: 3 }, { name: 'Eve', id: 5 }],
          requiredVotes: 'majority',
          votingInProgress: true,
          ballotResults: { Alice: 4, Charlie: 3, Eve: 3 },
          votersWhoVoted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          elected: null,
        },
      };

      const state = meetingReducer(stateWithElection, {
        type: 'CLOSE_ELECTION',
        timestamp: '10:50:00',
      });

      expect(state.currentElection?.elected).toBeNull();
    });

    it('should handle 2/3 vote requirement', () => {
      const stateWithElection: MeetingState = {
        ...initialState,
        currentElection: {
          id: 1,
          position: 'President',
          candidates: [{ name: 'Alice', id: 1 }],
          requiredVotes: '2/3',
          votingInProgress: true,
          ballotResults: { Alice: 7 },
          votersWhoVoted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          elected: null,
        },
      };

      const state = meetingReducer(stateWithElection, {
        type: 'CLOSE_ELECTION',
        timestamp: '10:50:00',
      });

      expect(state.currentElection?.elected).toBe('Alice');
    });

    it('should handle plurality vote requirement', () => {
      const stateWithElection: MeetingState = {
        ...initialState,
        currentElection: {
          id: 1,
          position: 'President',
          candidates: [{ name: 'Alice', id: 1 }, { name: 'Charlie', id: 3 }],
          requiredVotes: 'plurality',
          votingInProgress: true,
          ballotResults: { Alice: 4, Charlie: 3 },
          votersWhoVoted: [1, 2, 3, 4, 5, 6, 7],
          elected: null,
        },
      };

      const state = meetingReducer(stateWithElection, {
        type: 'CLOSE_ELECTION',
        timestamp: '10:50:00',
      });

      expect(state.currentElection?.elected).toBe('Alice');
    });

    it('should return unchanged if no election', () => {
      const state = meetingReducer(initialState, {
        type: 'CLOSE_ELECTION',
        timestamp: '10:50:00',
      });

      expect(state).toBe(initialState);
    });
  });

  describe('DECLARE_ELECTED', () => {
    it('should add elected officer', () => {
      const stateWithElection: MeetingState = {
        ...initialState,
        currentElection: {
          id: 1,
          position: 'President',
          candidates: [{ name: 'Alice', id: 1 }],
          requiredVotes: 'majority',
          votingInProgress: false,
          ballotResults: { Alice: 6 },
          votersWhoVoted: [1, 2, 3, 4, 5, 6],
          elected: 'Alice',
        },
      };

      const state = meetingReducer(stateWithElection, {
        type: 'DECLARE_ELECTED',
        candidateName: 'Alice',
        timestamp: '10:55:00',
      });

      expect(state.electedOfficers).toHaveLength(1);
      expect(state.electedOfficers[0].name).toBe('Alice');
      expect(state.electedOfficers[0].position).toBe('President');
      expect(state.currentElection).toBeNull();
    });

    it('should return unchanged if no election', () => {
      const state = meetingReducer(initialState, {
        type: 'DECLARE_ELECTED',
        candidateName: 'Alice',
        timestamp: '10:55:00',
      });

      expect(state).toBe(initialState);
    });
  });

  describe('ASK_INQUIRY', () => {
    it('should add parliamentary inquiry', () => {
      const state = meetingReducer(initialState, {
        type: 'ASK_INQUIRY',
        inquiryType: 'parliamentary',
        question: 'Is this motion in order?',
        askedBy: 'John',
        askerId: 1,
        inquiryId: 1,
        timestamp: '10:25:00',
      });

      expect(state.inquiries).toHaveLength(1);
      expect(state.inquiries[0].type).toBe('parliamentary');
      expect(state.meetingLog.some(l => l.message.includes('Parliamentary Inquiry'))).toBe(true);
    });

    it('should add request for information', () => {
      const state = meetingReducer(initialState, {
        type: 'ASK_INQUIRY',
        inquiryType: 'information',
        question: 'What time does the meeting end?',
        askedBy: 'Jane',
        askerId: 2,
        inquiryId: 2,
        timestamp: '10:26:00',
      });

      expect(state.inquiries).toHaveLength(1);
      expect(state.inquiries[0].type).toBe('information');
      expect(state.meetingLog.some(l => l.message.includes('Request for Information'))).toBe(true);
    });
  });

  describe('ANSWER_INQUIRY', () => {
    it('should record answer to inquiry', () => {
      const stateWithInquiry: MeetingState = {
        ...initialState,
        inquiries: [{
          id: 1,
          type: 'parliamentary',
          question: 'Is this in order?',
          askedBy: 'John',
          askerId: 1,
          timestamp: '10:25:00',
        }],
      };

      const state = meetingReducer(stateWithInquiry, {
        type: 'ANSWER_INQUIRY',
        inquiryId: 1,
        answer: 'Yes, the motion is in order.',
        answeredBy: 'Chair',
        timestamp: '10:26:00',
      });

      expect(state.inquiries[0].answer).toBe('Yes, the motion is in order.');
      expect(state.inquiries[0].answeredBy).toBe('Chair');
    });
  });

  describe('default case', () => {
    it('should return state unchanged for unknown action', () => {
      const state = meetingReducer(initialState, {
        type: 'UNKNOWN_ACTION' as any,
      });

      expect(state).toBe(initialState);
    });
  });
});
