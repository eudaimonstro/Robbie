/**
 * Action Validator Tests
 * Tests for validating meeting actions before dispatch
 */
import { describe, it, expect } from 'vitest';
import { validateAction } from '../socket/actionValidator.js';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member, DebateStance } from '@robbie-bylawyer/shared/types';

// Helper to create a member
function createMember(
  id: number,
  role: 'admin' | 'chair' | 'member' = 'member',
  present = true,
): Member {
  return { id, name: `Member ${id}`, role, present };
}

// Helper to create a complete Motion object
function createMotion(
  overrides: Partial<{
    id: number;
    mover: string;
    moverId: number;
    text: string;
    debatable: boolean;
  }> = {},
) {
  return {
    id: overrides.id ?? 1,
    type: 'mainMotion',
    name: 'Main Motion',
    text: overrides.text ?? 'Test motion',
    mover: overrides.mover ?? 'Member 2',
    moverId: overrides.moverId ?? 2,
    secondedBy: null,
    status: 'active' as const,
    precedence: 0,
    category: 'main' as const,
    interrupt: false,
    needsSecond: true,
    debatable: overrides.debatable ?? true,
    amendable: true,
    reconsidered: false,
    vote: 'majority' as const,
    phrase: 'I move that...',
    help: 'Help text',
    whenToUse: 'When to use',
  };
}

// Helper to create active meeting state
function activeMeetingState(): MeetingState {
  return {
    ...initialState,
    meetingActive: true,
    members: [createMember(1, 'chair'), createMember(2, 'member'), createMember(3, 'member')],
  };
}

describe('actionValidator', () => {
  describe('START_MEETING', () => {
    it('should allow starting inactive meeting', () => {
      const result = validateAction(initialState, {
        type: 'START_MEETING',
        meetingCode: 'TEST',
        timestamp: '',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject starting already active meeting', () => {
      const state = { ...initialState, meetingActive: true };
      const result = validateAction(state, {
        type: 'START_MEETING',
        meetingCode: 'TEST',
        timestamp: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('MEETING_ALREADY_ACTIVE');
    });
  });

  describe('END_MEETING', () => {
    it('should allow ending active meeting', () => {
      const state = { ...initialState, meetingActive: true };
      const result = validateAction(state, { type: 'END_MEETING', timestamp: '' });
      expect(result.valid).toBe(true);
    });

    it('should reject ending inactive meeting', () => {
      const result = validateAction(initialState, { type: 'END_MEETING', timestamp: '' });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('MEETING_NOT_ACTIVE');
    });
  });

  describe('MAKE_MOTION', () => {
    it('should allow making motion when meeting is active', () => {
      const state = activeMeetingState();
      const result = validateAction(state, {
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: 'Test motion',
        mover: 'Member 2',
        moverId: 2,
        motionId: 1,
        timestamp: '',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject motion when meeting is not active', () => {
      const result = validateAction(initialState, {
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: 'Test motion',
        mover: 'Member 2',
        moverId: 2,
        motionId: 1,
        timestamp: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('MEETING_NOT_ACTIVE');
    });

    it('should reject motion with text exceeding 500 characters', () => {
      const state = activeMeetingState();
      const result = validateAction(state, {
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: 'x'.repeat(501),
        mover: 'Member 2',
        moverId: 2,
        motionId: 1,
        timestamp: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_ACTION');
    });

    it('should reject unknown motion type', () => {
      const state = activeMeetingState();
      const result = validateAction(state, {
        type: 'MAKE_MOTION',
        motionType: 'invalid-motion-type',
        text: 'Test',
        mover: 'Member 2',
        moverId: 2,
        motionId: 1,
        timestamp: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('UNKNOWN_MOTION_TYPE');
    });
  });

  describe('SECOND_MOTION', () => {
    it('should allow seconding when motion is pending', () => {
      const state: MeetingState = {
        ...activeMeetingState(),
        pendingSecond: createMotion(),
      };
      const result = validateAction(state, {
        type: 'SECOND_MOTION',
        seconder: 'Member 3',
        timestamp: '',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject seconding when no motion is pending', () => {
      const state = activeMeetingState();
      const result = validateAction(state, {
        type: 'SECOND_MOTION',
        seconder: 'Member 3',
        timestamp: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('NO_PENDING_SECOND');
    });
  });

  describe('CAST_VOTE', () => {
    const votingState = (): MeetingState => ({
      ...activeMeetingState(),
      votingOpen: true,
      currentMotion: createMotion(),
      voters: [],
      voterChoices: {},
    });

    it('should allow casting vote when voting is open', () => {
      const result = validateAction(votingState(), {
        type: 'CAST_VOTE',
        vote: 'yea',
        voterId: 2,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject vote when voting is not open', () => {
      const state = { ...votingState(), votingOpen: false };
      const result = validateAction(state, {
        type: 'CAST_VOTE',
        vote: 'yea',
        voterId: 2,
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('VOTING_NOT_OPEN');
    });

    it('should reject duplicate votes', () => {
      const state = { ...votingState(), voters: [2] };
      const result = validateAction(state, {
        type: 'CAST_VOTE',
        vote: 'yea',
        voterId: 2,
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('ALREADY_VOTED');
    });

    it('should reject chair vote when restriction is active', () => {
      const state = votingState();
      const result = validateAction(state, {
        type: 'CAST_VOTE',
        vote: 'yea',
        voterId: 1, // Chair
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('CHAIR_CANNOT_VOTE');
    });

    it('should allow chair deciding vote', () => {
      const state = votingState();
      const result = validateAction(state, {
        type: 'CAST_VOTE',
        vote: 'yea',
        voterId: 1,
        isChairDecidingVote: true,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('RAISE_HAND', () => {
    const debatableState = (): MeetingState => ({
      ...activeMeetingState(),
      currentMotion: createMotion(),
      speakerQueue: [],
      debatePositions: {},
    });

    it('should allow raising hand for debatable motion', () => {
      const result = validateAction(debatableState(), {
        type: 'RAISE_HAND',
        member: createMember(3),
        stance: 'pro' as DebateStance,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject when no motion on floor', () => {
      const state = activeMeetingState();
      const result = validateAction(state, {
        type: 'RAISE_HAND',
        member: createMember(3),
        stance: 'pro' as DebateStance,
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('NO_CURRENT_MOTION');
    });

    it('should reject when motion is not debatable', () => {
      const state: MeetingState = {
        ...debatableState(),
        currentMotion: createMotion({ debatable: false }),
      };
      const result = validateAction(state, {
        type: 'RAISE_HAND',
        member: createMember(3),
        stance: 'pro' as DebateStance,
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('MOTION_NOT_DEBATABLE');
    });

    it('should reject when already in queue', () => {
      const member = createMember(3);
      const state: MeetingState = {
        ...debatableState(),
        speakerQueue: [{ member, stance: 'pro' as DebateStance }],
      };
      const result = validateAction(state, {
        type: 'RAISE_HAND',
        member,
        stance: 'pro' as DebateStance,
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('ALREADY_IN_QUEUE');
    });

    it('should reject side-switching when not suspended', () => {
      const member = createMember(3);
      const state: MeetingState = {
        ...debatableState(),
        debatePositions: { 3: 'pro' as DebateStance },
      };
      const result = validateAction(state, {
        type: 'RAISE_HAND',
        member,
        stance: 'con' as DebateStance,
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('CANNOT_SWITCH_SIDES');
    });
  });

  describe('Proxy Voting', () => {
    const proxyEnabledState = (): MeetingState => ({
      ...activeMeetingState(),
      allowProxyVoting: true,
      allowMemberProxyGrant: true,
      maxProxiesPerMember: 2,
      proxies: [],
      pendingProxyRequests: [],
    });

    describe('GRANT_PROXY', () => {
      it('should allow valid proxy grant', () => {
        const state = proxyEnabledState();
        const result = validateAction(state, {
          type: 'GRANT_PROXY',
          proxyId: 1,
          grantedBy: 2,
          grantedByName: 'Member 2',
          grantedTo: 3,
          grantedToName: 'Member 3',
          scope: 'all',
          timestamp: '',
        });
        expect(result.valid).toBe(true);
      });

      it('should reject when proxy voting disabled', () => {
        const state = { ...proxyEnabledState(), allowProxyVoting: false };
        const result = validateAction(state, {
          type: 'GRANT_PROXY',
          proxyId: 1,
          grantedBy: 2,
          grantedByName: 'Member 2',
          grantedTo: 3,
          grantedToName: 'Member 3',
          scope: 'all',
          timestamp: '',
        });
        expect(result.valid).toBe(false);
        expect(result.errorCode).toBe('PROXY_VOTING_DISABLED');
      });

      it('should reject self-proxy', () => {
        const state = proxyEnabledState();
        const result = validateAction(state, {
          type: 'GRANT_PROXY',
          proxyId: 1,
          grantedBy: 2,
          grantedByName: 'Member 2',
          grantedTo: 2,
          grantedToName: 'Member 2',
          scope: 'all',
          timestamp: '',
        });
        expect(result.valid).toBe(false);
        expect(result.errorCode).toBe('CANNOT_PROXY_SELF');
      });

      it('should reject when max proxies reached', () => {
        const state: MeetingState = {
          ...proxyEnabledState(),
          proxies: [
            {
              id: 1,
              grantedBy: 10,
              grantedByName: 'M10',
              grantedTo: 3,
              grantedToName: 'M3',
              scope: 'all',
              grantedAt: '',
            },
            {
              id: 2,
              grantedBy: 11,
              grantedByName: 'M11',
              grantedTo: 3,
              grantedToName: 'M3',
              scope: 'all',
              grantedAt: '',
            },
          ],
        };
        const result = validateAction(state, {
          type: 'GRANT_PROXY',
          proxyId: 3,
          grantedBy: 2,
          grantedByName: 'Member 2',
          grantedTo: 3,
          grantedToName: 'Member 3',
          scope: 'all',
          timestamp: '',
        });
        expect(result.valid).toBe(false);
        expect(result.errorCode).toBe('MAX_PROXIES_REACHED');
      });
    });

    describe('REQUEST_PROXY', () => {
      it('should allow valid proxy request', () => {
        const state = proxyEnabledState();
        const result = validateAction(state, {
          type: 'REQUEST_PROXY',
          requestId: 1,
          requestedBy: 2,
          requestedByName: 'Member 2',
          requestedFor: 3,
          requestedForName: 'Member 3',
          scope: 'all',
          timestamp: '',
        });
        expect(result.valid).toBe(true);
      });

      it('should reject when member proxy grants disabled', () => {
        const state = { ...proxyEnabledState(), allowMemberProxyGrant: false };
        const result = validateAction(state, {
          type: 'REQUEST_PROXY',
          requestId: 1,
          requestedBy: 2,
          requestedByName: 'Member 2',
          requestedFor: 3,
          requestedForName: 'Member 3',
          scope: 'all',
          timestamp: '',
        });
        expect(result.valid).toBe(false);
        expect(result.errorCode).toBe('MEMBER_PROXY_DISABLED');
      });

      it('should reject with existing pending request', () => {
        const state: MeetingState = {
          ...proxyEnabledState(),
          pendingProxyRequests: [
            {
              id: 1,
              requestedBy: 2,
              requestedByName: 'Member 2',
              requestedFor: 3,
              requestedForName: 'Member 3',
              requestedAt: '',
              scope: 'all',
              status: 'pending',
            },
          ],
        };
        const result = validateAction(state, {
          type: 'REQUEST_PROXY',
          requestId: 2,
          requestedBy: 2,
          requestedByName: 'Member 2',
          requestedFor: 1,
          requestedForName: 'Member 1',
          scope: 'all',
          timestamp: '',
        });
        expect(result.valid).toBe(false);
        expect(result.errorCode).toBe('REQUEST_PENDING');
      });
    });

    describe('ACCEPT_PROXY', () => {
      it('should allow accepting pending request', () => {
        const state: MeetingState = {
          ...proxyEnabledState(),
          pendingProxyRequests: [
            {
              id: 1,
              requestedBy: 2,
              requestedByName: 'Member 2',
              requestedFor: 3,
              requestedForName: 'Member 3',
              requestedAt: '',
              scope: 'all',
              status: 'pending',
            },
          ],
        };
        const result = validateAction(state, {
          type: 'ACCEPT_PROXY',
          requestId: 1,
          proxyId: 10,
          timestamp: '',
        });
        expect(result.valid).toBe(true);
      });

      it('should reject non-existent request', () => {
        const state = proxyEnabledState();
        const result = validateAction(state, {
          type: 'ACCEPT_PROXY',
          requestId: 999,
          proxyId: 10,
          timestamp: '',
        });
        expect(result.valid).toBe(false);
        expect(result.errorCode).toBe('REQUEST_NOT_FOUND');
      });
    });
  });

  describe('Roll Call', () => {
    it('should allow starting roll call when not in progress', () => {
      const state = activeMeetingState();
      const result = validateAction(state, {
        type: 'START_ROLL_CALL',
        timestamp: '',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject starting roll call when already in progress', () => {
      const state: MeetingState = {
        ...activeMeetingState(),
        rollCall: { inProgress: true, responses: [], startedAt: '' },
      };
      const result = validateAction(state, {
        type: 'START_ROLL_CALL',
        timestamp: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_STATE');
    });

    it('should allow responding to roll call when in progress', () => {
      const state: MeetingState = {
        ...activeMeetingState(),
        rollCall: { inProgress: true, responses: [], startedAt: '' },
      };
      const result = validateAction(state, {
        type: 'RESPOND_ROLL_CALL',
        memberId: 2,
        status: 'present',
        timestamp: '',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject responding when not in progress', () => {
      const state = activeMeetingState();
      const result = validateAction(state, {
        type: 'RESPOND_ROLL_CALL',
        memberId: 2,
        status: 'present',
        timestamp: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('ROLL_CALL_NOT_IN_PROGRESS');
    });
  });

  describe('Agenda', () => {
    it('should allow adopting unadopted agenda', () => {
      const state = activeMeetingState();
      const result = validateAction(state, {
        type: 'ADOPT_AGENDA',
        timestamp: '',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject adopting already adopted agenda', () => {
      const state = { ...activeMeetingState(), agendaAdopted: true };
      const result = validateAction(state, {
        type: 'ADOPT_AGENDA',
        timestamp: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('AGENDA_ALREADY_ADOPTED');
    });

    it('should allow calling agenda item after adoption', () => {
      const state: MeetingState = {
        ...activeMeetingState(),
        agendaAdopted: true,
        agenda: [{ id: 1, title: 'Item 1', status: 'pending' }],
      };
      const result = validateAction(state, {
        type: 'CALL_AGENDA_ITEM',
        id: 1,
        timestamp: '',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject calling item before agenda adoption', () => {
      const state: MeetingState = {
        ...activeMeetingState(),
        agenda: [{ id: 1, title: 'Item 1', status: 'pending' }],
      };
      const result = validateAction(state, {
        type: 'CALL_AGENDA_ITEM',
        id: 1,
        timestamp: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('AGENDA_NOT_ADOPTED');
    });
  });

  describe('Unknown action', () => {
    it('should reject unknown action types', () => {
      const state = activeMeetingState();
      const result = validateAction(state, {
        type: 'INVALID_UNKNOWN_ACTION',
        timestamp: '',
      } as any);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_ACTION');
    });
  });
});
