import { describe, it, expect } from 'vitest';
import { meetingReducer, initialState } from '../../reducer/index.js';
import type { MeetingAction, MeetingState, Motion, Member } from '../../types/index.js';
import { isRuleSuspended } from '../../utils/ruleSuspensionHelper.js';

// Mock members for testing (initialState now starts with empty members array)
const mockMembers: Member[] = [
  { id: 1, name: 'Alice', role: 'member', present: true },
  { id: 2, name: 'Bob', role: 'member', present: true },
  { id: 3, name: 'Carol', role: 'member', present: true },
  { id: 4, name: 'David', role: 'chair', present: true },
  { id: 5, name: 'Eve', role: 'admin', present: true },
];

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
    it('should start the meeting and keep the code it was created with', () => {
      // The server creates each meeting's state with its room code; starting the
      // meeting must not replace it (links, packets and minutes are keyed by it)
      const state = meetingReducer(
        { ...initialState, meetingCode: 'DEMO' },
        { type: 'START_MEETING', timestamp: '10:00:00' },
      );

      expect(state.meetingActive).toBe(true);
      expect(state.meetingCode).toBe('DEMO');
      expect(state.meetingStage).toBe('call-to-order');
    });

    it('should add a log entry', () => {
      const state = meetingReducer(initialState, {
        type: 'START_MEETING',
        timestamp: '10:00:00',
      });

      expect(state.meetingLog.length).toBeGreaterThan(0);
      expect(state.meetingLog[0].message).toContain('Meeting called to order');
    });

    it('completes a first agenda item that is the call to order', () => {
      const state = meetingReducer(
        {
          ...initialState,
          agenda: [
            { id: 1, title: ' call to ORDER ', status: 'pending' },
            { id: 2, title: 'Treasurer report', status: 'pending' },
          ],
        },
        { type: 'START_MEETING', timestamp: '10:00:00' },
      );

      expect(state.agenda.map((item) => item.status)).toEqual(['completed', 'pending']);
      expect(state.currentAgendaItem).toBeNull();
      expect(state.meetingLog.map((entry) => entry.message)).toEqual([
        'Meeting called to order.',
        'Completed: " call to ORDER "',
      ]);
    });

    it.each(['Call to order.', 'Calling the meeting to order', 'call the meeting to order.'])(
      'recognizes a first item titled %s',
      (title) => {
        const state = meetingReducer(
          {
            ...initialState,
            agenda: [
              { id: 1, title, status: 'pending' },
              { id: 2, title: 'Treasurer report', status: 'pending' },
            ],
          },
          { type: 'START_MEETING', timestamp: '10:00:00' },
        );
        expect(state.agenda.map((item) => item.status)).toEqual(['completed', 'pending']);
      },
    );

    it('leaves a first item that only mentions the call to order', () => {
      const agenda = [{ id: 1, title: 'Call to order and welcome', status: 'pending' as const }];
      const state = meetingReducer(
        { ...initialState, agenda },
        { type: 'START_MEETING', timestamp: '10:00:00' },
      );
      expect(state.agenda).toEqual(agenda);
    });

    it('leaves the agenda alone when the call to order is not its first item', () => {
      const agenda = [
        { id: 1, title: 'Opening remarks', status: 'pending' as const },
        { id: 2, title: 'Call to order', status: 'pending' as const },
      ];
      const state = meetingReducer(
        { ...initialState, agenda },
        { type: 'START_MEETING', timestamp: '10:00:00' },
      );

      expect(state.agenda).toEqual(agenda);
      expect(state.meetingLog).toHaveLength(1);
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

    it('completes the agenda item before the meeting, then adjourns', () => {
      const atAdjournment: MeetingState = {
        ...initialState,
        meetingActive: true,
        agendaAdopted: true,
        agenda: [
          { id: 1, title: 'Old business', status: 'completed' },
          { id: 2, title: 'Adjournment', status: 'active' },
        ],
        currentAgendaItem: { id: 2, title: 'Adjournment', status: 'active' },
      };

      const state = meetingReducer(atAdjournment, { type: 'END_MEETING', timestamp: '11:00:00' });

      expect(state.meetingStage).toBe('adjourned');
      expect(state.currentAgendaItem).toBeNull();
      expect(state.agenda.map((item) => item.status)).toEqual(['completed', 'completed']);
      expect(state.meetingLog.slice(-2).map((entry) => entry.message)).toEqual([
        'Completed: "Adjournment"',
        'Meeting adjourned.',
      ]);
    });

    it('completes the adjournment item when it has not been called', () => {
      const inNewBusiness: MeetingState = {
        ...initialState,
        meetingActive: true,
        agendaAdopted: true,
        agenda: [
          { id: 1, title: 'New business', status: 'active' },
          { id: 2, title: 'Pool hours', status: 'pending' },
          { id: 3, title: 'ADJOURNMENT', status: 'pending' },
        ],
        currentAgendaItem: { id: 1, title: 'New business', status: 'active' },
      };

      const state = meetingReducer(inNewBusiness, { type: 'END_MEETING', timestamp: '11:00:00' });

      expect(state.agenda.map((item) => item.status)).toEqual([
        'completed',
        'pending',
        'completed',
      ]);
      expect(state.meetingLog.map((entry) => entry.message)).toEqual([
        'Completed: "New business"',
        'Completed: "ADJOURNMENT"',
        'Meeting adjourned.',
      ]);
    });

    it.each(['Adjourn', 'Adjournment.', ' adjourn. '])('completes an item titled %s', (title) => {
      const state = meetingReducer(
        {
          ...initialState,
          meetingActive: true,
          agenda: [
            { id: 1, title: 'New business', status: 'completed' },
            { id: 2, title, status: 'pending' },
            { id: 3, title: 'Adjourned business', status: 'pending' },
          ],
        },
        { type: 'END_MEETING', timestamp: '11:00:00' },
      );
      expect(state.agenda.map((item) => item.status)).toEqual([
        'completed',
        'completed',
        'pending',
      ]);
    });

    it('completes the adjournment item between agenda items', () => {
      const betweenItems: MeetingState = {
        ...initialState,
        meetingActive: true,
        agendaAdopted: true,
        agenda: [
          { id: 1, title: 'New business', status: 'completed' },
          { id: 2, title: 'Adjournment', status: 'pending' },
        ],
      };

      const state = meetingReducer(betweenItems, { type: 'END_MEETING', timestamp: '11:00:00' });

      expect(state.agenda.map((item) => item.status)).toEqual(['completed', 'completed']);
      expect(state.meetingLog.map((entry) => entry.message)).toEqual([
        'Completed: "Adjournment"',
        'Meeting adjourned.',
      ]);
    });
    it('ends the business under way, and records what was left unfinished', () => {
      const main = createMockMotion({ id: 1, text: 'Resurface the pool' });
      const amendment = createMockMotion({ id: 2, type: 'amend', text: 'add "by June"' });
      const awaiting = createMockMotion({ id: 3, type: 'previousQuestion', text: 'Vote now' });
      const busy: MeetingState = {
        ...initialState,
        meetingActive: true,
        members: mockMembers,
        nominationsOpen: true,
        currentNominationPosition: 'Treasurer',
        motionStack: [main, amendment],
        currentMotion: amendment,
        pendingSecond: awaiting,
        votingOpen: true,
        voteTimerEnd: 1000,
        unanimousConsentPending: true,
        speakerQueue: [{ member: mockMembers[0], stance: 'pro' }],
        recognizedSpeaker: mockMembers[1],
        speakerTimerEnd: 2000,
        debatePositions: { 2: 'pro' },
      };

      const state = meetingReducer(busy, { type: 'END_MEETING', timestamp: '11:00:00' });

      expect(state).toMatchObject({
        nominationsOpen: false,
        currentNominationPosition: null,
        currentElection: null,
        pendingSecond: null,
        currentMotion: null,
        motionStack: [],
        votingOpen: false,
        voteTimerEnd: null,
        unanimousConsentPending: false,
        speakerQueue: [],
        recognizedSpeaker: null,
        speakerTimerEnd: null,
        debatePositions: {},
      });
      expect(state.meetingLog.map((entry) => entry.message)).toEqual([
        'The meeting adjourned with the election for Treasurer, the motion "Resurface the pool", ' +
          'the motion "add "by June"" and the motion "Vote now" unfinished.',
        'Meeting adjourned.',
      ]);
    });

    it('takes the choices of a secret ballot it interrupts with it', () => {
      const state = meetingReducer(
        {
          ...initialState,
          meetingActive: true,
          members: mockMembers,
          currentMotion: createMockMotion({ id: 1, text: 'Resurface the pool' }),
          motionStack: [createMockMotion({ id: 1, text: 'Resurface the pool' })],
          votingOpen: true,
          votingMethod: 'ballot',
          votes: { yea: 2, nay: 1, abstain: 0 },
          voters: [2, 3, 4],
          voterChoices: { 2: 'yea', 3: 'nay', 4: 'yea' },
          proxyVotes: [{ memberId: 4, castBy: 2, vote: 'yea' }],
          floorVotes: { yea: 4, nay: 2, abstain: 0 },
        },
        { type: 'END_MEETING', timestamp: '11:00:00' },
      );

      expect(state).toMatchObject({
        votingOpen: false,
        votes: { yea: 0, nay: 0, abstain: 0 },
        voters: [],
        voterChoices: {},
        proxyVotes: [],
        floorVotes: { yea: 0, nay: 0, abstain: 0 },
      });
      // It was never decided, so it leaves no record
      expect(state.completedMotions).toEqual([]);
    });

    it('keeps the count of a vote already decided', () => {
      const decided: MeetingState = {
        ...initialState,
        meetingActive: true,
        votes: { yea: 3, nay: 1, abstain: 0 },
        voters: [2, 3, 4, 5],
      };
      const state = meetingReducer(decided, { type: 'END_MEETING', timestamp: '11:00:00' });
      expect(state.votes).toEqual(decided.votes);
      expect(state.voters).toEqual(decided.voters);
    });

    it('records an election under way as unfinished', () => {
      const state = meetingReducer(
        {
          ...initialState,
          meetingActive: true,
          currentElection: {
            id: 1,
            position: 'Secretary',
            candidates: [{ name: 'Alice', id: 1 }],
            requiredVotes: 'majority',
            votingInProgress: true,
            ballotResults: { Alice: 0 },
            votersWhoVoted: [],
            elected: null,
          },
        },
        { type: 'END_MEETING', timestamp: '11:00:00' },
      );

      expect(state.currentElection).toBeNull();
      expect(state.meetingLog.map((entry) => entry.message)).toEqual([
        'The meeting adjourned with the election for Secretary unfinished.',
        'Meeting adjourned.',
      ]);
    });
  });

  describe('MAKE_MOTION', () => {
    it('stacks a seconded secondary amendment on the pending amendment', () => {
      const main = createMockMotion({ id: 1, type: 'mainMotion', precedence: 1 });
      const amendment = createMockMotion({ id: 2, type: 'amend', name: 'Amend', precedence: 3 });
      let state: MeetingState = {
        ...initialState,
        meetingActive: true,
        currentMotion: amendment,
        motionStack: [main, amendment],
      };

      state = meetingReducer(state, {
        type: 'MAKE_MOTION',
        motionType: 'amendAmendment',
        text: 'by striking "annual"',
        mover: 'John',
        moverId: 1,
        motionId: 3,
        timestamp: '10:05:00',
      });
      state = meetingReducer(state, {
        type: 'SECOND_MOTION',
        seconder: 'Jane',
        timestamp: '10:06:00',
      });

      expect(state.currentMotion?.type).toBe('amendAmendment');
      expect(state.motionStack.map((m) => m.type)).toEqual([
        'mainMotion',
        'amend',
        'amendAmendment',
      ]);
    });

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

  describe('WITHDRAW_MOTION', () => {
    it('should allow mover to withdraw a motion pending a second', () => {
      const stateWithPending: MeetingState = {
        ...initialState,
        meetingActive: true,
        pendingSecond: createMockMotion({ moverId: 1, mover: 'Alice' }),
      };

      const state = meetingReducer(stateWithPending, {
        type: 'WITHDRAW_MOTION',
        requesterId: 1,
        timestamp: '10:06:00',
      });

      expect(state.pendingSecond).toBeNull();
      expect(state.meetingLog[state.meetingLog.length - 1].message).toContain('withdrawn');
    });

    it('should allow mover to withdraw the current motion', () => {
      const motion = createMockMotion({ moverId: 2, mover: 'Bob' });
      const stateWithMotion: MeetingState = {
        ...initialState,
        meetingActive: true,
        currentMotion: motion,
        motionStack: [motion],
      };

      const state = meetingReducer(stateWithMotion, {
        type: 'WITHDRAW_MOTION',
        requesterId: 2,
        timestamp: '10:07:00',
      });

      expect(state.currentMotion).toBeNull();
      expect(state.motionStack).toHaveLength(0);
      expect(state.meetingLog[state.meetingLog.length - 1].message).toContain('withdrawn');
    });

    it('should not allow non-mover to withdraw a motion', () => {
      const stateWithPending: MeetingState = {
        ...initialState,
        meetingActive: true,
        pendingSecond: createMockMotion({ moverId: 1 }),
      };

      const state = meetingReducer(stateWithPending, {
        type: 'WITHDRAW_MOTION',
        requesterId: 99, // Different user
        timestamp: '10:06:00',
      });

      // Motion should still be pending - withdrawal rejected
      expect(state.pendingSecond).not.toBeNull();
    });

    it('should reset debate state when current motion is withdrawn', () => {
      const motion = createMockMotion({ moverId: 1 });
      const stateWithDebate: MeetingState = {
        ...initialState,
        meetingActive: true,
        currentMotion: motion,
        motionStack: [motion],
        speakerQueue: [
          { member: { id: 2, name: 'Carol', role: 'member', present: true }, stance: 'pro' },
        ],
        debatePositions: { 2: 'pro' },
      };

      const state = meetingReducer(stateWithDebate, {
        type: 'WITHDRAW_MOTION',
        requesterId: 1,
        timestamp: '10:08:00',
      });

      expect(state.speakerQueue).toHaveLength(0);
      expect(state.debatePositions).toEqual({});
    });
  });

  describe('MODIFY_MOTION', () => {
    it('should allow mover to modify a motion pending a second', () => {
      const stateWithPending: MeetingState = {
        ...initialState,
        meetingActive: true,
        pendingSecond: createMockMotion({ moverId: 1, mover: 'Alice', text: 'Original text' }),
      };

      const state = meetingReducer(stateWithPending, {
        type: 'MODIFY_MOTION',
        requesterId: 1,
        newText: 'Modified text',
        timestamp: '10:06:00',
      });

      expect(state.pendingSecond?.text).toBe('Modified text');
      expect(state.meetingLog[state.meetingLog.length - 1].message).toContain('modifies');
    });

    it('should allow mover to modify current motion before debate begins', () => {
      const motion = createMockMotion({ moverId: 2, mover: 'Bob', moverHasSpoken: false });
      const stateWithMotion: MeetingState = {
        ...initialState,
        meetingActive: true,
        currentMotion: motion,
        motionStack: [motion],
      };

      const state = meetingReducer(stateWithMotion, {
        type: 'MODIFY_MOTION',
        requesterId: 2,
        newText: 'New motion text',
        timestamp: '10:07:00',
      });

      expect(state.currentMotion?.text).toBe('New motion text');
      expect(state.motionStack[0].text).toBe('New motion text');
    });

    it('should not allow non-mover to modify a motion', () => {
      const stateWithPending: MeetingState = {
        ...initialState,
        meetingActive: true,
        pendingSecond: createMockMotion({ moverId: 1, text: 'Original' }),
      };

      const state = meetingReducer(stateWithPending, {
        type: 'MODIFY_MOTION',
        requesterId: 99,
        newText: 'Modified',
        timestamp: '10:06:00',
      });

      expect(state.pendingSecond?.text).toBe('Original');
    });

    it('should not allow modification after debate has begun', () => {
      const motion = createMockMotion({ moverId: 1, moverHasSpoken: true, text: 'Original' });
      const stateAfterDebate: MeetingState = {
        ...initialState,
        meetingActive: true,
        currentMotion: motion,
        motionStack: [motion],
      };

      const state = meetingReducer(stateAfterDebate, {
        type: 'MODIFY_MOTION',
        requesterId: 1,
        newText: 'Modified',
        timestamp: '10:08:00',
      });

      expect(state.currentMotion?.text).toBe('Original');
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

    it('should log individual votes during roll call voting', () => {
      const votingState: MeetingState = {
        ...initialState,
        meetingActive: true,
        votingOpen: true,
        votingMethod: 'rollcall',
        currentMotion: createMockMotion(),
        motionStack: [createMockMotion()],
        members: [
          { id: 1, name: 'Alice', role: 'member', present: true },
          { id: 2, name: 'Bob', role: 'member', present: true },
        ],
      };

      const state = meetingReducer(votingState, {
        type: 'CAST_VOTE',
        vote: 'yea',
        voterId: 1,
        timestamp: '10:15:00',
      });

      expect(state.votes.yea).toBe(1);
      expect(state.meetingLog.length).toBe(1);
      expect(state.meetingLog[0].message).toBe('[ROLL CALL] Alice: Yea');
      expect(state.meetingLog[0].time).toBe('10:15:00');
    });

    it('should not log votes during standard voting', () => {
      const votingState: MeetingState = {
        ...initialState,
        meetingActive: true,
        votingOpen: true,
        votingMethod: 'standard',
        currentMotion: createMockMotion(),
        motionStack: [createMockMotion()],
        members: [{ id: 1, name: 'Alice', role: 'member', present: true }],
      };

      const state = meetingReducer(votingState, {
        type: 'CAST_VOTE',
        vote: 'yea',
        voterId: 1,
        timestamp: '10:15:00',
      });

      expect(state.votes.yea).toBe(1);
      expect(state.meetingLog.length).toBe(0);
    });

    it('should not log vote changes during roll call (only initial votes)', () => {
      const votingState: MeetingState = {
        ...initialState,
        meetingActive: true,
        votingOpen: true,
        votingMethod: 'rollcall',
        currentMotion: createMockMotion(),
        motionStack: [createMockMotion()],
        members: [{ id: 1, name: 'Alice', role: 'member', present: true }],
        votes: { yea: 1, nay: 0, abstain: 0 },
        voters: [1],
        voterChoices: { 1: 'yea' },
        meetingLog: [{ time: '10:15:00', message: '[ROLL CALL] Alice: Yea' }],
      };

      // Change vote from yea to nay
      const state = meetingReducer(votingState, {
        type: 'CAST_VOTE',
        vote: 'nay',
        voterId: 1,
        timestamp: '10:16:00',
      });

      // Vote should be changed but no new log entry
      expect(state.votes.yea).toBe(0);
      expect(state.votes.nay).toBe(1);
      expect(state.meetingLog.length).toBe(1); // Still just the original log
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
      expect(state.meetingLog.some((l) => l.message.includes('CARRIED'))).toBe(true);
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
      expect(state.meetingLog.some((l) => l.message.includes('FAILED'))).toBe(true);
    });

    it('should record the proposed change when a bylaw amendment is defeated', () => {
      const bylawAmendment = {
        documentId: 'doc-1',
        changeType: 'modify' as const,
        targetSectionId: 'sec-1',
        newContent: 'New text',
      };
      const motion = createMockMotion({ type: 'bylawAmendment', vote: '2/3', bylawAmendment });
      const state = meetingReducer(
        {
          ...initialState,
          meetingActive: true,
          votingOpen: true,
          currentMotion: motion,
          motionStack: [motion],
          votes: { yea: 1, nay: 4, abstain: 0 },
        },
        { type: 'CLOSE_VOTING', timestamp: '10:15:00' },
      );

      expect(state.defeatedMotions).toEqual([
        expect.objectContaining({ type: 'bylawAmendment', bylawAmendment }),
      ]);
    });

    it('should clear the speaker state once the question is decided', () => {
      // Debate on an amendment must not carry over to the main motion it returns to
      const mainMotion = createMockMotion({ id: 1 });
      const amendment = createMockMotion({ id: 2, type: 'amend', vote: 'majority' });
      const speaker = { id: 3, name: 'Member 3', role: 'member' as const, present: true };
      const state = meetingReducer(
        {
          ...initialState,
          meetingActive: true,
          votingOpen: true,
          currentMotion: amendment,
          motionStack: [mainMotion, amendment],
          votes: { yea: 3, nay: 1, abstain: 0 },
          speakerQueue: [{ member: speaker, stance: 'pro' }],
          recognizedSpeaker: speaker,
          speakerTimerEnd: 123456,
          lastSpeakerStance: 'pro',
        },
        { type: 'CLOSE_VOTING', timestamp: '10:15:00' },
      );

      expect(state.currentMotion?.id).toBe(1);
      expect(state.speakerQueue).toEqual([]);
      expect(state.recognizedSpeaker).toBeNull();
      expect(state.speakerTimerEnd).toBeNull();
      expect(state.lastSpeakerStance).toBeNull();
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

      expect(state.meetingLog.some((l) => l.message.includes('FAILED'))).toBe(true);
    });
    describe('appeal from the decision of the chair', () => {
      // The question is "Shall the decision of the chair be sustained?" (YEA = sustain).
      // RONR: a majority or a tie sustains the chair; only a majority against overturns it.
      const closeAppeal = (votes: { yea: number; nay: number; abstain: number }) =>
        meetingReducer(
          {
            ...initialState,
            meetingActive: true,
            votingOpen: true,
            currentMotion: createMockMotion({ type: 'appeal', name: 'Appeal', vote: 'majority' }),
            motionStack: [createMockMotion({ type: 'appeal', name: 'Appeal', vote: 'majority' })],
            votes,
          },
          { type: 'CLOSE_VOTING', timestamp: '10:15:00' },
        );
      const outcome = (state: MeetingState) =>
        state.meetingLog.some((l) => l.message.includes('SUSTAINED'))
          ? 'sustained'
          : state.meetingLog.some((l) => l.message.includes('OVERTURNED'))
            ? 'overturned'
            : 'none';

      it('sustains the chair on a tie', () => {
        expect(outcome(closeAppeal({ yea: 4, nay: 4, abstain: 0 }))).toBe('sustained');
      });

      it('sustains the chair when a majority votes to sustain', () => {
        expect(outcome(closeAppeal({ yea: 5, nay: 3, abstain: 1 }))).toBe('sustained');
      });

      it('overturns the chair only when a majority votes against', () => {
        expect(outcome(closeAppeal({ yea: 3, nay: 5, abstain: 0 }))).toBe('overturned');
      });
    });
  });

  describe('RAISE_HAND', () => {
    it('should add member to speaker queue', () => {
      const member = mockMembers[0];
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
      const member = mockMembers[0];
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

    it('should reject raising hand with opposite stance after speaking (side-switching)', () => {
      const member = mockMembers[0];
      const stateWithPreviousStance: MeetingState = {
        ...initialState,
        debatePositions: { [member.id]: 'pro' }, // Member already spoke pro
      };

      const state = meetingReducer(stateWithPreviousStance, {
        type: 'RAISE_HAND',
        member,
        stance: 'con', // Trying to switch to con
      });

      // Should reject - return unchanged state
      expect(state).toBe(stateWithPreviousStance);
      expect(state.speakerQueue.length).toBe(0);
    });

    it('should allow raising hand with same stance after speaking', () => {
      const member = mockMembers[0];
      const stateWithPreviousStance: MeetingState = {
        ...initialState,
        debatePositions: { [member.id]: 'pro' }, // Member already spoke pro
      };

      const state = meetingReducer(stateWithPreviousStance, {
        type: 'RAISE_HAND',
        member,
        stance: 'pro', // Same stance
      });

      expect(state.speakerQueue.length).toBe(1);
      expect(state.speakerQueue[0].stance).toBe('pro');
    });

    it('should allow neutral stance regardless of previous stance', () => {
      const member = mockMembers[0];
      const stateWithPreviousStance: MeetingState = {
        ...initialState,
        debatePositions: { [member.id]: 'pro' }, // Member already spoke pro
      };

      const state = meetingReducer(stateWithPreviousStance, {
        type: 'RAISE_HAND',
        member,
        stance: 'neutral', // Neutral is always allowed
      });

      expect(state.speakerQueue.length).toBe(1);
      expect(state.speakerQueue[0].stance).toBe('neutral');
    });
  });

  describe('LOWER_HAND', () => {
    it('should remove member from speaker queue', () => {
      const member = mockMembers[0];
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
      const member = mockMembers[0];
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

    it('should reject recognition of non-mover when mover has not spoken on debatable motion', () => {
      const mover = mockMembers[0];
      const otherMember = mockMembers[1];
      const motion = {
        id: 1,
        type: 'mainMotion',
        name: 'Main Motion',
        text: 'Test motion',
        mover: mover.name,
        moverId: mover.id,
        secondedBy: 'Someone',
        status: 'active' as const,
        precedence: 1,
        category: 'main' as const,
        interrupt: false,
        needsSecond: true,
        debatable: true,
        amendable: true,
        reconsidered: true,
        vote: 'majority' as const,
        phrase: '',
        help: '',
        whenToUse: '',
        moverHasSpoken: false, // Mover hasn't spoken yet
      };

      const stateWithMotion: MeetingState = {
        ...initialState,
        members: mockMembers,
        currentMotion: motion,
        motionStack: [motion],
        speakerQueue: [{ member: otherMember, stance: 'con' }],
      };

      // Try to recognize someone who is NOT the mover
      const state = meetingReducer(stateWithMotion, {
        type: 'RECOGNIZE_SPEAKER',
        member: otherMember,
        stance: 'con',
        speakerTimerEnd: null,
        timestamp: '10:20:00',
      });

      // Should reject - return unchanged state
      expect(state).toBe(stateWithMotion);
      expect(state.recognizedSpeaker).toBeNull();
    });

    it('should allow mover to be recognized first', () => {
      const mover = mockMembers[0];
      const motion = {
        id: 1,
        type: 'mainMotion',
        name: 'Main Motion',
        text: 'Test motion',
        mover: mover.name,
        moverId: mover.id,
        secondedBy: 'Someone',
        status: 'active' as const,
        precedence: 1,
        category: 'main' as const,
        interrupt: false,
        needsSecond: true,
        debatable: true,
        amendable: true,
        reconsidered: true,
        vote: 'majority' as const,
        phrase: '',
        help: '',
        whenToUse: '',
        moverHasSpoken: false,
      };

      const stateWithMotion: MeetingState = {
        ...initialState,
        currentMotion: motion,
        motionStack: [motion],
        speakerQueue: [{ member: mover, stance: 'pro' }],
      };

      const state = meetingReducer(stateWithMotion, {
        type: 'RECOGNIZE_SPEAKER',
        member: mover,
        stance: 'pro',
        speakerTimerEnd: null,
        timestamp: '10:20:00',
      });

      expect(state.recognizedSpeaker).toEqual(mover);
      expect(state.currentMotion?.moverHasSpoken).toBe(true);
    });

    it('should allow non-mover after mover has spoken', () => {
      const mover = mockMembers[0];
      const otherMember = mockMembers[1];
      const motion = {
        id: 1,
        type: 'mainMotion',
        name: 'Main Motion',
        text: 'Test motion',
        mover: mover.name,
        moverId: mover.id,
        secondedBy: 'Someone',
        status: 'active' as const,
        precedence: 1,
        category: 'main' as const,
        interrupt: false,
        needsSecond: true,
        debatable: true,
        amendable: true,
        reconsidered: true,
        vote: 'majority' as const,
        phrase: '',
        help: '',
        whenToUse: '',
        moverHasSpoken: true, // Mover has already spoken
      };

      const stateWithMotion: MeetingState = {
        ...initialState,
        members: mockMembers,
        currentMotion: motion,
        motionStack: [motion],
        speakerQueue: [{ member: otherMember, stance: 'con' }],
      };

      const state = meetingReducer(stateWithMotion, {
        type: 'RECOGNIZE_SPEAKER',
        member: otherMember,
        stance: 'con',
        speakerTimerEnd: null,
        timestamp: '10:20:00',
      });

      expect(state.recognizedSpeaker).toEqual(otherMember);
    });
  });

  describe('YIELD_FLOOR', () => {
    it('should clear recognized speaker', () => {
      const member = mockMembers[0];
      const stateWithSpeaker: MeetingState = {
        ...initialState,
        members: mockMembers,
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
      expect(state.meetingLog.some((l) => l.message.includes('objects'))).toBe(true);
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
      expect(state.meetingLog.some((l) => l.message.includes('unanimous consent'))).toBe(true);
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
      expect(state.agenda.find((a) => a.id === 2)?.status).toBe('active');
    });
  });

  describe('COMPLETE_AGENDA_ITEM', () => {
    it('should mark agenda item as completed', () => {
      const stateWithItem: MeetingState = {
        ...initialState,
        meetingActive: true,
        agendaAdopted: true,
        agenda: [{ id: 1, title: 'First Item', status: 'active' }],
        currentAgendaItem: { id: 1, title: 'First Item', status: 'active' },
      };

      const state = meetingReducer(stateWithItem, {
        type: 'COMPLETE_AGENDA_ITEM',
        id: 1,
        timestamp: '10:20:00',
      });

      expect(state.currentAgendaItem).toBeNull();
      expect(state.agenda.find((a) => a.id === 1)?.status).toBe('completed');
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

    it('should leave the agenda unchanged for an index that is out of range', () => {
      // A stale index from another client must not put a hole in the agenda
      const agenda = [
        { id: 1, title: 'First', status: 'pending' as const },
        { id: 2, title: 'Second', status: 'pending' as const },
      ];
      const state = meetingReducer(
        { ...initialState, agenda },
        { type: 'REORDER_AGENDA', fromIndex: 5, toIndex: 0 },
      );

      expect(state.agenda).toEqual(agenda);
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

    it('should return to the motion that was pending before the point of order', () => {
      const mainMotion = createMockMotion({ id: 1, type: 'mainMotion' });
      const pointOfOrder = createMockMotion({ id: 2, type: 'pointOrder', vote: 'none' });
      const state = meetingReducer(
        {
          ...initialState,
          meetingActive: true,
          currentMotion: pointOfOrder,
          motionStack: [mainMotion, pointOfOrder],
        },
        { type: 'CHAIR_RULING', ruling: 'overrule', timestamp: '10:10:00' },
      );

      expect(state.motionStack).toEqual([mainMotion]);
      expect(state.currentMotion).toEqual(mainMotion);
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
        committeeReports: [
          {
            id: 1,
            committee: 'Finance',
            presenter: 'Jane Doe',
            content: 'Report content',
            recommendations: 'Some recommendations',
            presented: false,
          },
        ],
      };

      const state = meetingReducer(stateWithReport, {
        type: 'PRESENT_COMMITTEE_REPORT',
        reportId: 1,
        timestamp: '10:15:00',
      });

      expect(state.committeeReports[0].presented).toBe(true);
      expect(state.meetingLog.some((l) => l.message.includes('Finance'))).toBe(true);
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

  describe('single-action rule suspensions', () => {
    const suspension = (id: number, scope: 'single-action' | 'meeting-remainder') => ({
      id,
      rule: 'debate-rules' as const,
      purpose: 'Allow debate',
      specificAction: 'Debate the pending motion',
      scope,
      suspendedAt: '10:00:00',
      actionCompleted: false,
      motionId: 99,
    });
    const closeVoteOn = (suspendedRules: MeetingState['suspendedRules']) => {
      const motion = createMockMotion({ vote: 'majority' });
      return meetingReducer(
        {
          ...initialState,
          meetingActive: true,
          votingOpen: true,
          currentMotion: motion,
          motionStack: [motion],
          votes: { yea: 3, nay: 1, abstain: 0 },
          suspendedRules,
        },
        { type: 'CLOSE_VOTING', timestamp: '10:15:00' },
      );
    };

    it('end once the next question is decided', () => {
      const state = closeVoteOn([suspension(1, 'single-action')]);
      expect(isRuleSuspended(state, 'debate-rules')).toBe(false);
      expect(state.meetingLog.at(-1)?.message).toContain('[RULE RESTORED] debate-rules');
    });

    it('leave suspensions for the rest of the meeting in place', () => {
      const state = closeVoteOn([suspension(1, 'meeting-remainder')]);
      expect(isRuleSuspended(state, 'debate-rules')).toBe(true);
    });

    it('stay in force when the vote being closed is the one that suspended the rule', () => {
      const motion = createMockMotion({
        type: 'suspendRules',
        vote: '2/3',
        ruleSuspension: {
          rule: 'debate-rules',
          purpose: 'Allow debate',
          specificAction: 'Debate the pending motion',
          scope: 'single-action',
        },
      });
      const state = meetingReducer(
        {
          ...initialState,
          meetingActive: true,
          votingOpen: true,
          currentMotion: motion,
          motionStack: [motion],
          votes: { yea: 3, nay: 0, abstain: 0 },
        },
        { type: 'CLOSE_VOTING', timestamp: '10:15:00' },
      );
      expect(isRuleSuspended(state, 'debate-rules')).toBe(true);
    });
  });

  describe('reconsider', () => {
    // A limit-debate motion (not debatable) was adopted, moved by Alice
    const completed = {
      id: 10,
      type: 'limitDebate',
      name: 'Limit Debate',
      text: 'Limit debate to 2 minutes',
      mover: 'Alice',
      moverId: 5,
      passed: true,
      voterChoices: { 6: 'yea' as const },
      timestamp: '10:00:00',
      reconsidered: false,
    };
    const reconsider = createMockMotion({
      id: 20,
      type: 'reconsider',
      vote: 'majority',
      mover: 'Bob',
      moverId: 6,
      reconsideredMotionId: 10,
    });
    const pending: MeetingState = {
      ...initialState,
      meetingActive: true,
      currentMotion: reconsider,
      motionStack: [reconsider],
      completedMotions: [completed],
    };

    const byVote = () =>
      meetingReducer(
        { ...pending, votingOpen: true, votes: { yea: 3, nay: 1, abstain: 0 } },
        { type: 'CLOSE_VOTING', timestamp: '10:20:00' },
      );

    it('brings the motion back as it was', () => {
      const motion = byVote().currentMotion;
      expect(motion).toMatchObject({
        type: 'limitDebate',
        text: 'Limit debate to 2 minutes',
        debatable: false,
        mover: 'Alice',
        moverId: 5,
      });
    });

    it('gives the same result each time (the reducer stays pure)', () => {
      expect(byVote().currentMotion).toEqual(byVote().currentMotion);
    });

    it('brings the motion back when adopted by unanimous consent', () => {
      const state = meetingReducer(
        { ...pending, unanimousConsentPending: true },
        { type: 'UNANIMOUS_CONSENT_PASSED', timestamp: '10:20:00' },
      );
      expect(state.currentMotion?.text).toBe('Limit debate to 2 minutes');
      expect(state.completedMotions[0].reconsidered).toBe(true);
    });
  });

  describe('ADVANCE_MEETING_STAGE at the end of the order of business', () => {
    it('stays at the last stage; only adjourning (END_MEETING) ends the meeting', () => {
      const atAnnouncements: MeetingState = {
        ...initialState,
        meetingActive: true,
        meetingStage: 'announcements',
      };
      const state = meetingReducer(atAnnouncements, {
        type: 'ADVANCE_MEETING_STAGE',
        timestamp: '11:00:00',
      });

      // It used to move to 'adjourned' with the meeting still active, and each further
      // advance logged "Meeting adjourned" again
      expect(state.meetingStage).toBe('announcements');
      expect(state.meetingLog).toEqual(atAnnouncements.meetingLog);
    });
  });

  describe('agenda item bookkeeping', () => {
    const agenda = [
      { id: 1, title: 'Budget', status: 'pending' as const },
      { id: 2, title: 'Picnic', status: 'pending' as const },
    ];

    it('records the called item as active in both places', () => {
      const state = meetingReducer(
        { ...initialState, agendaAdopted: true, agenda },
        { type: 'CALL_AGENDA_ITEM', id: 1, timestamp: '10:00:00' },
      );
      expect(state.agenda[0].status).toBe('active');
      expect(state.currentAgendaItem?.status).toBe('active');
    });

    it('keeps the current item when a different one is completed', () => {
      const called = meetingReducer(
        { ...initialState, agendaAdopted: true, agenda },
        { type: 'CALL_AGENDA_ITEM', id: 1, timestamp: '10:00:00' },
      );
      const state = meetingReducer(called, {
        type: 'COMPLETE_AGENDA_ITEM',
        id: 2,
        timestamp: '10:05:00',
      });
      expect(state.currentAgendaItem?.id).toBe(1);
    });
  });

  describe('motion and role bookkeeping', () => {
    it('lets the mover reword a motion awaiting a second while debate on another goes on', () => {
      // Debate has begun on the main motion; the amendment awaiting a second is untouched
      const mainMotion = createMockMotion({ id: 1, moverHasSpoken: true });
      const amendment = createMockMotion({ id: 2, type: 'amend', moverId: 3, status: 'pending' });
      const state = meetingReducer(
        {
          ...initialState,
          meetingActive: true,
          currentMotion: mainMotion,
          motionStack: [mainMotion],
          pendingSecond: amendment,
        },
        { type: 'MODIFY_MOTION', requesterId: 3, newText: 'by striking "blue"', timestamp: '' },
      );
      expect(state.pendingSecond?.text).toBe('by striking "blue"');
    });

    it('makes a motion that needs no second the active question', () => {
      const state = meetingReducer(
        { ...initialState, meetingActive: true },
        {
          type: 'MAKE_MOTION',
          motionType: 'pointOrder',
          text: 'Point of order',
          mover: 'Member 2',
          moverId: 2,
          motionId: 7,
          timestamp: '',
        },
      );
      expect(state.currentMotion?.status).toBe('active');
    });

    it('leaves one chair when a new chair is appointed', () => {
      const members: Member[] = [
        { id: 1, name: 'Old Chair', role: 'chair', present: true },
        { id: 2, name: 'New Chair', role: 'member', present: true },
      ];
      // No previousChairId given: the reducer finds the current chair itself
      const state = meetingReducer(
        { ...initialState, members },
        { type: 'SET_MEMBER_ROLE', targetMemberId: 2, newRole: 'chair', timestamp: '' },
      );
      expect(state.members.filter((m) => m.role === 'chair').map((m) => m.id)).toEqual([2]);
    });
  });

  describe('RESTORE_RULE', () => {
    it('should remove rule suspension', () => {
      const stateWithSuspension: MeetingState = {
        ...initialState,
        suspendedRules: [
          {
            id: 1,
            rule: 'debate-rules',
            purpose: 'Speed up meeting',
            specificAction: 'Limit debate',
            scope: 'meeting-remainder',
            suspendedAt: '10:20:00',
            actionCompleted: false,
            motionId: 5,
          },
        ],
      };

      const state = meetingReducer(stateWithSuspension, {
        type: 'RESTORE_RULE',
        suspensionId: 1,
        timestamp: '10:30:00',
      });

      expect(state.suspendedRules).toHaveLength(0);
      expect(state.meetingLog.some((l) => l.message.includes('RULE RESTORED'))).toBe(true);
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
        nominations: [
          {
            id: 1,
            position: 'President',
            nomineeName: 'John Smith',
            nomineeId: 2,
            nominatedBy: 'Jane Doe',
            nominatorId: 1,
            timestamp: '10:32:00',
            declined: false,
          },
        ],
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
    it('closes nominations still open, so nothing is left open once the officer is declared', () => {
      let state: MeetingState = { ...initialState, meetingActive: true, members: mockMembers };
      const steps: MeetingAction[] = [
        { type: 'OPEN_NOMINATIONS', position: 'Treasurer', timestamp: '10:30:00' },
        {
          type: 'NOMINATE',
          position: 'Treasurer',
          nomineeName: 'Alice',
          nomineeId: 1,
          nominatedBy: 'Bob',
          nominatorId: 2,
          nominationId: 1,
          timestamp: '10:31:00',
        },
        {
          type: 'START_ELECTION',
          electionId: 1,
          position: 'Treasurer',
          requiredVotes: 'majority',
          timestamp: '10:32:00',
        },
      ];
      for (const step of steps) state = meetingReducer(state, step);
      expect(state.nominationsOpen).toBe(false);

      state = meetingReducer(state, { type: 'CAST_BALLOT', candidateName: 'Alice', voterId: 2 });
      state = meetingReducer(state, { type: 'CLOSE_ELECTION', timestamp: '10:35:00' });
      state = meetingReducer(state, {
        type: 'DECLARE_ELECTED',
        candidateName: 'Alice',
        timestamp: '10:36:00',
      });
      expect(state).toMatchObject({
        nominationsOpen: false,
        currentNominationPosition: null,
        currentElection: null,
      });
    });

    it('should start election with candidates', () => {
      const stateWithNominations: MeetingState = {
        ...initialState,
        nominationsOpen: false,
        currentNominationPosition: 'President',
        nominations: [
          {
            id: 1,
            position: 'President',
            nomineeName: 'Alice',
            nomineeId: 1,
            nominatedBy: 'Bob',
            nominatorId: 2,
            timestamp: '10:32:00',
            declined: false,
          },
          {
            id: 2,
            position: 'President',
            nomineeName: 'Charlie',
            nomineeId: 3,
            nominatedBy: 'Bob',
            nominatorId: 2,
            timestamp: '10:33:00',
            declined: false,
          },
          {
            id: 3,
            position: 'President',
            nomineeName: 'Dave',
            nomineeId: 4,
            nominatedBy: 'Bob',
            nominatorId: 2,
            timestamp: '10:34:00',
            declined: true,
          },
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
          candidates: [
            { name: 'Alice', id: 1 },
            { name: 'Charlie', id: 3 },
          ],
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
          candidates: [
            { name: 'Alice', id: 1 },
            { name: 'Charlie', id: 3 },
          ],
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
          candidates: [
            { name: 'Alice', id: 1 },
            { name: 'Charlie', id: 3 },
            { name: 'Eve', id: 5 },
          ],
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
      // RONR: balloting continues until a candidate has the required vote, with every
      // candidate still standing, so a new ballot opens rather than leaving the election closed
      expect(state.currentElection).toMatchObject({
        votingInProgress: true,
        votersWhoVoted: [],
        ballotResults: { Alice: 0, Charlie: 0, Eve: 0 },
      });
      expect(state.currentElection?.candidates.map((c) => c.name)).toEqual([
        'Alice',
        'Charlie',
        'Eve',
      ]);
      expect(state.meetingLog.at(-1)?.message).toContain('Ballot 2 is now open');
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
          candidates: [
            { name: 'Alice', id: 1 },
            { name: 'Charlie', id: 3 },
          ],
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

    it('should elect no one when no ballots were cast', () => {
      const closeEmpty = (requiredVotes: 'plurality' | 'majority', names: string[]) =>
        meetingReducer(
          {
            ...initialState,
            currentElection: {
              id: 1,
              position: 'Treasurer',
              candidates: names.map((name, id) => ({ name, id })),
              requiredVotes,
              votingInProgress: true,
              ballotResults: Object.fromEntries(names.map((n) => [n, 0])),
              votersWhoVoted: [],
              elected: null,
            },
          },
          { type: 'CLOSE_ELECTION', timestamp: '10:50:00' },
        );

      // A lone candidate with 0 votes is not elected by plurality
      expect(closeEmpty('plurality', ['Alice']).currentElection).toMatchObject({
        elected: null,
        votingInProgress: true,
      });
      // Candidates at 0-0 are not a tie to run off: the ballot stays as it was
      const state = closeEmpty('majority', ['Alice', 'Bob']);
      expect(state.currentElection?.isRunoff).toBeFalsy();
      expect(state.currentElection?.candidates).toHaveLength(2);
    });

    it('should return unchanged if no election', () => {
      const state = meetingReducer(initialState, {
        type: 'CLOSE_ELECTION',
        timestamp: '10:50:00',
      });

      expect(state).toBe(initialState);
    });
  });

  describe('SET_ASIDE_ELECTION', () => {
    const nominee = {
      id: 1,
      position: 'Treasurer',
      nomineeName: 'Alice',
      nomineeId: 1,
      nominatedBy: 'Bob',
      nominatorId: 2,
      timestamp: '10:32:00',
      declined: false,
    };

    it('closes nominations that found no nominee, keeping the record of them', () => {
      const closedEmpty: MeetingState = {
        ...initialState,
        nominationsOpen: false,
        currentNominationPosition: 'Treasurer',
      };

      const state = meetingReducer(closedEmpty, {
        type: 'SET_ASIDE_ELECTION',
        timestamp: '10:40:00',
      });

      expect(state.nominationsOpen).toBe(false);
      expect(state.currentNominationPosition).toBeNull();
      expect(state.currentElection).toBeNull();
      expect(state.meetingLog.at(-1)?.message).toBe('The election for Treasurer was set aside.');
    });

    it('sets aside open nominations for a mistyped position', () => {
      const state = meetingReducer(
        { ...initialState, nominationsOpen: true, currentNominationPosition: 'Tresurer' },
        { type: 'SET_ASIDE_ELECTION', timestamp: '10:40:00' },
      );

      expect(state.nominationsOpen).toBe(false);
      expect(state.currentNominationPosition).toBeNull();
      expect(state.meetingLog.at(-1)?.message).toBe('The election for Tresurer was set aside.');
    });

    it('drops a ballot under way, and a winner not yet declared', () => {
      const elected: MeetingState = {
        ...initialState,
        nominations: [nominee],
        currentElection: {
          id: 7,
          position: 'Treasurer',
          candidates: [{ name: 'Alice', id: 1 }],
          requiredVotes: 'majority',
          votingInProgress: false,
          ballotResults: { Alice: 3 },
          votersWhoVoted: [1, 2, 3],
          elected: 'Alice',
        },
      };

      const state = meetingReducer(elected, { type: 'SET_ASIDE_ELECTION', timestamp: '10:40:00' });

      expect(state.currentElection).toBeNull();
      expect(state.electedOfficers).toEqual([]);
      expect(state.nominations).toEqual([nominee]);
      expect(state.meetingLog.at(-1)?.message).toBe('The election for Treasurer was set aside.');
    });

    it('does nothing with no election', () => {
      expect(
        meetingReducer(initialState, { type: 'SET_ASIDE_ELECTION', timestamp: '10:40:00' }),
      ).toBe(initialState);
    });

    it('closes nominations left open with no position', () => {
      const state = meetingReducer(
        { ...initialState, nominationsOpen: true },
        { type: 'SET_ASIDE_ELECTION', timestamp: '10:40:00' },
      );
      expect(state.nominationsOpen).toBe(false);
      expect(state.meetingLog.at(-1)?.message).toBe('The election was set aside.');
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

    it('should allow declaring write-in candidate as winner', () => {
      const stateWithElection: MeetingState = {
        ...initialState,
        members: [{ id: 10, name: 'Charlie', role: 'member', present: true }],
        currentElection: {
          id: 1,
          position: 'Secretary',
          candidates: [{ name: 'Alice', id: 1 }], // Only Alice nominated
          requiredVotes: 'majority',
          votingInProgress: false,
          ballotResults: { Alice: 2, Charlie: 4 }, // Charlie is write-in with more votes
          votersWhoVoted: [1, 2, 3, 4, 5, 6],
          elected: 'Charlie',
        },
      };

      const state = meetingReducer(stateWithElection, {
        type: 'DECLARE_ELECTED',
        candidateName: 'Charlie',
        timestamp: '10:55:00',
      });

      expect(state.electedOfficers).toHaveLength(1);
      expect(state.electedOfficers[0].name).toBe('Charlie');
      expect(state.electedOfficers[0].memberId).toBe(10); // Found from members list
      expect(state.meetingLog[0].message).toContain('write-in candidate');
    });

    it('should use memberId 0 for unknown write-in candidates', () => {
      const stateWithElection: MeetingState = {
        ...initialState,
        members: [{ id: 1, name: 'Alice', role: 'member', present: true }],
        currentElection: {
          id: 1,
          position: 'Treasurer',
          candidates: [{ name: 'Alice', id: 1 }],
          requiredVotes: 'plurality',
          votingInProgress: false,
          ballotResults: { 'External Person': 5 }, // Write-in not in members list
          votersWhoVoted: [1, 2, 3, 4, 5],
          elected: 'External Person',
        },
      };

      const state = meetingReducer(stateWithElection, {
        type: 'DECLARE_ELECTED',
        candidateName: 'External Person',
        timestamp: '10:55:00',
      });

      expect(state.electedOfficers).toHaveLength(1);
      expect(state.electedOfficers[0].name).toBe('External Person');
      expect(state.electedOfficers[0].memberId).toBe(0); // Unknown write-in
    });
  });

  describe('CAST_BALLOT with write-ins', () => {
    it('should accept write-in votes', () => {
      const stateWithElection: MeetingState = {
        ...initialState,
        currentElection: {
          id: 1,
          position: 'President',
          candidates: [{ name: 'Alice', id: 1 }], // Only Alice nominated
          requiredVotes: 'majority',
          votingInProgress: true,
          ballotResults: {},
          votersWhoVoted: [],
          elected: null,
        },
      };

      const state = meetingReducer(stateWithElection, {
        type: 'CAST_BALLOT',
        candidateName: 'WriteIn Candidate', // Not nominated
        voterId: 5,
      });

      expect(state.currentElection?.ballotResults['WriteIn Candidate']).toBe(1);
    });
  });

  describe('CLOSE_ELECTION with write-ins', () => {
    it('should mark write-in candidates in results', () => {
      const stateWithElection: MeetingState = {
        ...initialState,
        currentElection: {
          id: 1,
          position: 'VP',
          candidates: [{ name: 'Alice', id: 1 }],
          requiredVotes: 'plurality',
          votingInProgress: true,
          ballotResults: { Alice: 3, 'Bob WriteIn': 2 },
          votersWhoVoted: [1, 2, 3, 4, 5],
          elected: null,
        },
      };

      const state = meetingReducer(stateWithElection, {
        type: 'CLOSE_ELECTION',
        timestamp: '10:50:00',
      });

      expect(state.meetingLog[0].message).toContain('Bob WriteIn (write-in)');
      expect(state.meetingLog[0].message).not.toContain('Alice (write-in)');
    });
  });

  describe('CLOSE_ELECTION with ties', () => {
    it('should trigger runoff when plurality vote is tied', () => {
      const stateWithElection: MeetingState = {
        ...initialState,
        currentElection: {
          id: 1,
          position: 'President',
          candidates: [
            { name: 'Alice', id: 1 },
            { name: 'Bob', id: 2 },
          ],
          requiredVotes: 'plurality',
          votingInProgress: true,
          ballotResults: { Alice: 3, Bob: 3 }, // Tied!
          votersWhoVoted: [1, 2, 3, 4, 5, 6],
          elected: null,
        },
      };

      const state = meetingReducer(stateWithElection, {
        type: 'CLOSE_ELECTION',
        timestamp: '10:50:00',
      });

      expect(state.currentElection?.votingInProgress).toBe(true);
      expect(state.currentElection?.isRunoff).toBe(true);
      expect(state.currentElection?.runoffRound).toBe(1);
      expect(state.currentElection?.candidates).toHaveLength(2);
      expect(state.currentElection?.ballotResults).toEqual({});
      expect(state.currentElection?.votersWhoVoted).toEqual([]);
      expect(state.meetingLog[0].message).toContain('TIE');
      expect(state.meetingLog[0].message).toContain('Runoff vote (round 1)');
    });

    it('should trigger runoff when majority vote is tied at top without winner', () => {
      const stateWithElection: MeetingState = {
        ...initialState,
        currentElection: {
          id: 1,
          position: 'VP',
          candidates: [
            { name: 'Alice', id: 1 },
            { name: 'Bob', id: 2 },
            { name: 'Charlie', id: 3 },
          ],
          requiredVotes: 'majority',
          votingInProgress: true,
          ballotResults: { Alice: 3, Bob: 3, Charlie: 2 }, // Tied at top, no majority
          votersWhoVoted: [1, 2, 3, 4, 5, 6, 7, 8],
          elected: null,
        },
      };

      const state = meetingReducer(stateWithElection, {
        type: 'CLOSE_ELECTION',
        timestamp: '10:50:00',
      });

      expect(state.currentElection?.votingInProgress).toBe(true);
      expect(state.currentElection?.isRunoff).toBe(true);
      expect(state.currentElection?.candidates).toHaveLength(2); // Only tied candidates
      expect(state.currentElection?.candidates?.map((c) => c.name)).toEqual(['Alice', 'Bob']);
    });

    it('should NOT trigger runoff when there is a clear majority winner', () => {
      const stateWithElection: MeetingState = {
        ...initialState,
        currentElection: {
          id: 1,
          position: 'President',
          candidates: [
            { name: 'Alice', id: 1 },
            { name: 'Bob', id: 2 },
          ],
          requiredVotes: 'majority',
          votingInProgress: true,
          ballotResults: { Alice: 6, Bob: 4 }, // Alice has clear majority
          votersWhoVoted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          elected: null,
        },
      };

      const state = meetingReducer(stateWithElection, {
        type: 'CLOSE_ELECTION',
        timestamp: '10:50:00',
      });

      expect(state.currentElection?.votingInProgress).toBe(false);
      expect(state.currentElection?.isRunoff).toBeUndefined();
      expect(state.currentElection?.elected).toBe('Alice');
    });

    it('should increment runoff round for subsequent ties', () => {
      const stateWithRunoff: MeetingState = {
        ...initialState,
        currentElection: {
          id: 1,
          position: 'Secretary',
          candidates: [
            { name: 'Alice', id: 1 },
            { name: 'Bob', id: 2 },
          ],
          requiredVotes: 'plurality',
          votingInProgress: true,
          ballotResults: { Alice: 2, Bob: 2 }, // Tied again in runoff!
          votersWhoVoted: [1, 2, 3, 4],
          elected: null,
          isRunoff: true,
          runoffRound: 1,
        },
      };

      const state = meetingReducer(stateWithRunoff, {
        type: 'CLOSE_ELECTION',
        timestamp: '10:55:00',
      });

      expect(state.currentElection?.runoffRound).toBe(2);
      expect(state.meetingLog[0].message).toContain('round 2');
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
      expect(state.meetingLog.some((l) => l.message.includes('Parliamentary Inquiry'))).toBe(true);
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
      expect(state.meetingLog.some((l) => l.message.includes('Request for Information'))).toBe(
        true,
      );
    });
  });

  describe('ANSWER_INQUIRY', () => {
    it('should record answer to inquiry', () => {
      const stateWithInquiry: MeetingState = {
        ...initialState,
        inquiries: [
          {
            id: 1,
            type: 'parliamentary',
            question: 'Is this in order?',
            askedBy: 'John',
            askerId: 1,
            timestamp: '10:25:00',
          },
        ],
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

  describe('SET_MEMBER_ROLE', () => {
    it('should change member role to admin', () => {
      const stateWithMembers: MeetingState = {
        ...initialState,
        members: [
          { id: 1, name: 'Chair Person', role: 'chair', present: true },
          { id: 2, name: 'Regular Member', role: 'member', present: true },
        ],
      };

      const state = meetingReducer(stateWithMembers, {
        type: 'SET_MEMBER_ROLE',
        targetMemberId: 2,
        newRole: 'admin',
        changedBy: 'Chair Person',
        changedById: 1,
        timestamp: '10:30:00',
      });

      expect(state.members.find((m) => m.id === 2)?.role).toBe('admin');
      expect(state.meetingLog.some((l) => l.message.includes('admin'))).toBe(true);
      expect(state.meetingLog.some((l) => l.message.includes('[ROLE CHANGE]'))).toBe(true);
    });

    it('should transfer chair role and demote previous chair', () => {
      const stateWithMembers: MeetingState = {
        ...initialState,
        members: [
          { id: 1, name: 'Old Chair', role: 'chair', present: true },
          { id: 2, name: 'New Chair', role: 'member', present: true },
        ],
      };

      const state = meetingReducer(stateWithMembers, {
        type: 'SET_MEMBER_ROLE',
        targetMemberId: 2,
        newRole: 'chair',
        previousChairId: 1,
        changedBy: 'Admin User',
        changedById: 3,
        timestamp: '10:30:00',
      });

      expect(state.members.find((m) => m.id === 2)?.role).toBe('chair');
      expect(state.members.find((m) => m.id === 1)?.role).toBe('member');
      expect(state.meetingLog.some((l) => l.message.includes('[ROLE CHANGE]'))).toBe(true);
      expect(
        state.meetingLog.some((l) => l.message.includes('transferred chair to New Chair')),
      ).toBe(true);
    });

    it('should demote admin to member', () => {
      const stateWithMembers: MeetingState = {
        ...initialState,
        members: [
          { id: 1, name: 'Chair Person', role: 'chair', present: true },
          { id: 2, name: 'Admin Person', role: 'admin', present: true },
        ],
      };

      const state = meetingReducer(stateWithMembers, {
        type: 'SET_MEMBER_ROLE',
        targetMemberId: 2,
        newRole: 'member',
        changedBy: 'Chair Person',
        changedById: 1,
        timestamp: '10:30:00',
      });

      expect(state.members.find((m) => m.id === 2)?.role).toBe('member');
      expect(state.meetingLog.some((l) => l.message.includes('[ROLE CHANGE]'))).toBe(true);
    });

    it('should return state unchanged if target member not found', () => {
      const stateWithMembers: MeetingState = {
        ...initialState,
        members: [{ id: 1, name: 'Chair Person', role: 'chair', present: true }],
      };

      const state = meetingReducer(stateWithMembers, {
        type: 'SET_MEMBER_ROLE',
        targetMemberId: 999,
        newRole: 'admin',
        changedBy: 'Chair Person',
        changedById: 1,
        timestamp: '10:30:00',
      });

      expect(state).toBe(stateWithMembers);
    });
  });

  describe('START_ROLL_CALL', () => {
    it('should initialize roll call with all members', () => {
      const stateWithMembers: MeetingState = {
        ...initialState,
        members: [
          { id: 1, name: 'Alice', role: 'chair', present: false },
          { id: 2, name: 'Bob', role: 'member', present: false },
        ],
      };

      const state = meetingReducer(stateWithMembers, {
        type: 'START_ROLL_CALL',
        timestamp: '10:00:00',
      });

      expect(state.rollCall).not.toBeNull();
      expect(state.rollCall?.inProgress).toBe(true);
      expect(state.rollCall?.responses).toHaveLength(2);
      expect(state.rollCall?.responses[0].status).toBe('not-responded');
      expect(state.meetingLog[0].message).toContain('call the roll');
    });
  });

  describe('RESPOND_ROLL_CALL', () => {
    it('should record response and update member presence', () => {
      const stateWithRollCall: MeetingState = {
        ...initialState,
        members: [{ id: 1, name: 'Alice', role: 'chair', present: false }],
        rollCall: {
          inProgress: true,
          startedAt: '10:00:00',
          responses: [{ memberId: 1, memberName: 'Alice', status: 'not-responded' }],
        },
      };

      const state = meetingReducer(stateWithRollCall, {
        type: 'RESPOND_ROLL_CALL',
        memberId: 1,
        status: 'present',
        timestamp: '10:01:00',
      });

      expect(state.rollCall?.responses[0].status).toBe('present');
      expect(state.members[0].present).toBe(true);
      expect(state.meetingLog[0].message).toContain('Alice: Present');
    });
  });

  describe('COMPLETE_ROLL_CALL', () => {
    it('should complete roll call and log summary', () => {
      const stateWithRollCall: MeetingState = {
        ...initialState,
        members: [
          { id: 1, name: 'Alice', role: 'chair', present: true },
          { id: 2, name: 'Bob', role: 'member', present: true },
          { id: 3, name: 'Charlie', role: 'member', present: false },
        ],
        rollCall: {
          inProgress: true,
          startedAt: '10:00:00',
          responses: [
            { memberId: 1, memberName: 'Alice', status: 'present' },
            { memberId: 2, memberName: 'Bob', status: 'present' },
            { memberId: 3, memberName: 'Charlie', status: 'excused' },
          ],
        },
      };

      const state = meetingReducer(stateWithRollCall, {
        type: 'COMPLETE_ROLL_CALL',
        timestamp: '10:05:00',
      });

      expect(state.rollCall?.inProgress).toBe(false);
      expect(state.rollCall?.completedAt).toBe('10:05:00');
      expect(state.meetingLog[0].message).toContain('2 present');
      expect(state.meetingLog[0].message).toContain('1 excused');
    });
  });

  describe('MARK_ABSENT', () => {
    it('should mark member as absent', () => {
      const stateWithMembers: MeetingState = {
        ...initialState,
        members: [{ id: 1, name: 'Alice', role: 'member', present: true }],
      };

      const state = meetingReducer(stateWithMembers, {
        type: 'MARK_ABSENT',
        memberId: 1,
        excused: false,
        timestamp: '10:00:00',
      });

      expect(state.members[0].present).toBe(false);
      expect(state.meetingLog[0].message).toContain('Alice marked absent');
    });

    it('should mark member as excused absence', () => {
      const stateWithMembers: MeetingState = {
        ...initialState,
        members: [{ id: 1, name: 'Alice', role: 'member', present: true }],
      };

      const state = meetingReducer(stateWithMembers, {
        type: 'MARK_ABSENT',
        memberId: 1,
        excused: true,
        timestamp: '10:00:00',
      });

      expect(state.members[0].present).toBe(false);
      expect(state.meetingLog[0].message).toContain('excused absence');
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
