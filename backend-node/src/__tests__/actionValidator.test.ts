/**
 * Action Validator Tests
 * Tests for validating meeting actions before dispatch
 */
import { describe, it, expect } from 'vitest';
import { MAX_RULING_EXPLANATION_LENGTH, validateAction } from '../socket/actionValidator.js';
import { ACTION_TYPES, isServerOnly } from '../socket/permissionGuard.js';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type {
  MeetingAction,
  MeetingState,
  Member,
  DebateStance,
} from '@robbie-bylawyer/shared/types';

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
    agendaAdopted: true,
    members: [createMember(1, 'chair'), createMember(2, 'member'), createMember(3, 'member')],
  };
}

describe('actionValidator', () => {
  describe('START_MEETING', () => {
    it('should allow starting inactive meeting', () => {
      const result = validateAction(initialState, {
        type: 'START_MEETING',
        timestamp: '',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject starting already active meeting', () => {
      const state = { ...initialState, meetingActive: true };
      const result = validateAction(state, {
        type: 'START_MEETING',
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

    it('allows adjourning during an agenda item (the reducer completes it)', () => {
      const state = {
        ...initialState,
        meetingActive: true,
        agendaAdopted: true,
        agenda: [{ id: 2, title: 'Adjournment', status: 'active' as const }],
        currentAgendaItem: { id: 2, title: 'Adjournment', status: 'active' as const },
      };
      const result = validateAction(state, { type: 'END_MEETING', timestamp: '' });
      expect(result.valid).toBe(true);
    });

    it('should reject ending inactive meeting', () => {
      const result = validateAction(initialState, { type: 'END_MEETING', timestamp: '' });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('MEETING_NOT_ACTIVE');
    });

    it('refuses to adjourn while a vote is open', () => {
      const state = { ...activeMeetingState(), votingOpen: true, votingMethod: 'ballot' as const };
      expect(validateAction(state, { type: 'END_MEETING', timestamp: '' })).toEqual({
        valid: false,
        error: 'Close the vote before adjourning',
        errorCode: 'VOTING_IN_PROGRESS',
      });
    });

    it("refuses to adjourn while an election's ballot is open, but not before it", () => {
      const election = {
        id: 1,
        position: 'Treasurer',
        candidates: [{ name: 'Member 2', id: 2 }],
        requiredVotes: 'majority' as const,
        votingInProgress: true,
        ballotResults: { 'Member 2': 1 },
        votersWhoVoted: [3],
        elected: null,
      };
      const end = (state: MeetingState) =>
        validateAction(state, { type: 'END_MEETING', timestamp: '' });
      expect(end({ ...activeMeetingState(), currentElection: election })).toEqual({
        valid: false,
        error: 'Close the vote before adjourning',
        errorCode: 'VOTING_IN_PROGRESS',
      });
      // Nominations open, or a winner awaiting the declaration: the election is left unfinished
      expect(
        end({
          ...activeMeetingState(),
          nominationsOpen: true,
          currentNominationPosition: 'Director',
        }).valid,
      ).toBe(true);
      expect(
        end({
          ...activeMeetingState(),
          currentElection: { ...election, votingInProgress: false, elected: 'Member 2' },
        }).valid,
      ).toBe(true);
    });
  });

  describe('after adjournment', () => {
    const adjourned: MeetingState = {
      ...activeMeetingState(),
      meetingActive: false,
      meetingStage: 'adjourned',
    };
    const clientActions = ACTION_TYPES.filter(
      (type) => type !== 'START_MEETING' && !isServerOnly(type),
    );

    it.each(clientActions)('refuses %s', (type) => {
      expect(validateAction(adjourned, { type } as MeetingAction)).toEqual({
        valid: false,
        error: 'The meeting has adjourned',
        errorCode: 'MEETING_NOT_ACTIVE',
      });
    });

    it('can be called to order again', () => {
      expect(validateAction(adjourned, { type: 'START_MEETING', timestamp: '' }).valid).toBe(true);
    });

    it('still records who comes and goes', () => {
      const actions: MeetingAction[] = [
        { type: 'SET_MEMBER_PRESENCE', memberId: 2, present: false, timestamp: '' },
        { type: 'ADD_MEMBER', member: createMember(4), timestamp: '' },
        {
          type: 'REFRESH_MEMBERS',
          members: [{ id: 2, name: 'Member 2', role: 'admin' }],
          timestamp: '',
        },
        {
          type: 'SET_MEETING_INFO',
          organizationId: 'org',
          title: 'October meeting',
          scheduledFor: null,
          timestamp: '',
        },
      ];
      for (const action of actions) {
        expect(validateAction(adjourned, action), action.type).toEqual({ valid: true });
      }
    });
  });

  describe('CHAIR_RULING', () => {
    const point = { ...createMotion({ id: 7 }), type: 'pointOrder', vote: 'none' as const };
    const raised = (fields: Partial<MeetingState> = {}): MeetingState => ({
      ...activeMeetingState(),
      currentMotion: point,
      motionStack: [point],
      ...fields,
    });

    it('rules only on a point of order: a motion is decided by a vote, never a ruling', () => {
      const main = createMotion({ id: 3 });
      const result = validateAction(
        { ...activeMeetingState(), currentMotion: main, motionStack: [main] },
        { type: 'CHAIR_RULING', ruling: 'sustain', timestamp: '' } as never,
      );
      expect(result).toMatchObject({ valid: false, errorCode: 'INVALID_STATE' });
    });

    it('rules on a point of order raised during a vote', () => {
      const main = createMotion({ id: 3 });
      const result = validateAction(raised({ votingOpen: true, motionStack: [main, point] }), {
        type: 'CHAIR_RULING',
        ruling: 'overrule',
        timestamp: '',
      } as never);
      expect(result).toEqual({ valid: true });
    });

    it('takes an explanation of up to 2,000 characters, and nothing but text', () => {
      expect(MAX_RULING_EXPLANATION_LENGTH).toBe(2000);
      const rule = (explanation: unknown) =>
        validateAction(raised(), {
          type: 'CHAIR_RULING',
          ruling: 'sustain',
          explanation,
          timestamp: '',
        } as never);
      expect(rule(undefined)).toEqual({ valid: true });
      expect(rule('x'.repeat(2000))).toEqual({ valid: true });
      for (const explanation of ['x'.repeat(2001), 42, { text: 'x' }, ['x'], null]) {
        expect(rule(explanation), JSON.stringify(explanation)).toMatchObject({
          valid: false,
          errorCode: 'INVALID_ACTION',
        });
      }
    });
  });

  describe('REORDER_AGENDA', () => {
    const state = {
      ...activeMeetingState(),
      agenda: [
        { id: 1, title: 'First', status: 'pending' as const },
        { id: 2, title: 'Second', status: 'pending' as const },
      ],
    };
    const reorder = (fromIndex: number, toIndex: number) =>
      validateAction(state, { type: 'REORDER_AGENDA', fromIndex, toIndex });

    it('allows moving an item within the agenda', () => {
      expect(reorder(0, 1).valid).toBe(true);
    });

    it('rejects an index outside the agenda', () => {
      expect(reorder(2, 0).errorCode).toBe('ITEM_NOT_FOUND');
      expect(reorder(0, -1).errorCode).toBe('ITEM_NOT_FOUND');
      expect(reorder(0.5, 1).errorCode).toBe('ITEM_NOT_FOUND');
    });
  });

  describe('SECOND_MOTION by the mover', () => {
    const pending = (suspendedRules: MeetingState['suspendedRules'] = []) => ({
      ...activeMeetingState(),
      pendingSecond: { ...createMotion({ moverId: 2 }), status: 'pending' as const },
      suspendedRules,
    });
    const second = (state: MeetingState, seconderId: number) =>
      validateAction(state, { type: 'SECOND_MOTION', seconder: 'x', seconderId, timestamp: '' });

    it('is rejected: a member cannot second their own motion', () => {
      expect(second(pending(), 2).valid).toBe(false);
      expect(second(pending(), 3).valid).toBe(true);
    });

    it('is allowed while that rule is suspended', () => {
      const suspension = {
        id: 1,
        rule: 'mover-cannot-second' as const,
        purpose: '',
        specificAction: '',
        scope: 'meeting-remainder' as const,
        suspendedAt: '',
        motionId: 9,
      };
      expect(second(pending([suspension]), 2).valid).toBe(true);
    });
  });

  describe('NOMINATE', () => {
    const state: MeetingState = {
      ...activeMeetingState(),
      nominationsOpen: true,
      currentNominationPosition: 'Treasurer',
      nominations: [
        {
          id: 1,
          position: 'Treasurer',
          nomineeName: 'Pat Outsider',
          nomineeId: 0, // not a member of the meeting
          nominatedBy: 'Member 2',
          nominatorId: 2,
          timestamp: '',
          declined: false,
        },
      ],
    };
    const nominate = (nomineeName: string, nomineeId: number) =>
      validateAction(state, {
        type: 'NOMINATE',
        position: 'Treasurer',
        nomineeName,
        nomineeId,
        nominatedBy: 'Member 3',
        nominatorId: 3,
        nominationId: 2,
        timestamp: '',
      });

    it('accepts a second nominee from outside the meeting', () => {
      expect(nominate('Sam Outsider', 0).valid).toBe(true);
    });

    it('rejects the same nominee twice', () => {
      expect(nominate('pat outsider', 0).errorCode).toBe('ALREADY_NOMINATED');
    });
  });

  describe('elections', () => {
    const nomination = (position: string, declined = false) => ({
      id: 1,
      position,
      nomineeName: 'Member 2',
      nomineeId: 2,
      nominatedBy: 'Member 3',
      nominatorId: 3,
      timestamp: '',
      declined,
    });
    const start = (state: MeetingState) =>
      validateAction(state, {
        type: 'START_ELECTION',
        electionId: 1,
        position: 'Treasurer',
        requiredVotes: 'majority',
        timestamp: '',
      });
    const closed = { ...activeMeetingState(), currentNominationPosition: 'Treasurer' };

    it('starts a ballot only with a nominee for the position', () => {
      expect(start({ ...closed, nominations: [nomination('Treasurer')] }).valid).toBe(true);
      for (const nominations of [[], [nomination('Treasurer', true)], [nomination('Tresurer')]]) {
        expect(start({ ...closed, nominations })).toEqual({
          valid: false,
          error: 'Nobody has been nominated',
          errorCode: 'INVALID_STATE',
        });
      }
    });

    it('opens no vote on a motion while an election ballot is open', () => {
      const recess = createMotion({ text: 'Recess for ten minutes' });
      const state: MeetingState = {
        ...activeMeetingState(),
        currentMotion: recess,
        motionStack: [recess],
        currentElection: {
          id: 1,
          position: 'Treasurer',
          candidates: [{ name: 'Member 2', id: 2 }],
          requiredVotes: 'majority',
          votingInProgress: true,
          ballotResults: {},
          votersWhoVoted: [],
          elected: null,
        },
      };
      const openVoting = (s: MeetingState) =>
        validateAction(s, { type: 'OPEN_VOTING', voteTimerEnd: null, timestamp: '' });
      expect(openVoting(state)).toEqual({
        valid: false,
        error: 'A ballot is open',
        errorCode: 'VOTING_IN_PROGRESS',
      });
      // Once the ballot has closed, the motion comes to a vote
      expect(
        openVoting({
          ...state,
          currentElection: {
            ...state.currentElection!,
            votingInProgress: false,
            elected: 'Member 2',
          },
        }).valid,
      ).toBe(true);
    });

    it('opens no nominations while a question is pending', () => {
      const motion = createMotion();
      const openNominations = (s: MeetingState) =>
        validateAction(s, { type: 'OPEN_NOMINATIONS', position: 'Treasurer', timestamp: '' });
      const refused = {
        valid: false,
        error: 'Finish the pending question first',
        errorCode: 'INVALID_STATE',
      };
      expect(
        openNominations({ ...activeMeetingState(), currentMotion: motion, motionStack: [motion] }),
      ).toEqual(refused);
      expect(openNominations({ ...activeMeetingState(), pendingSecond: motion })).toEqual(refused);
      expect(openNominations(activeMeetingState()).valid).toBe(true);
    });

    it('starts no ballot while a vote is in progress', () => {
      expect(
        start({ ...closed, nominations: [nomination('Treasurer')], votingOpen: true }),
      ).toMatchObject({ valid: false, errorCode: 'VOTING_IN_PROGRESS' });
    });

    it('sets aside nominations or a ballot, and nothing when there is no election', () => {
      const setAside = (state: MeetingState) =>
        validateAction(state, { type: 'SET_ASIDE_ELECTION', timestamp: '' });
      expect(setAside(closed).valid).toBe(true);
      expect(
        setAside({
          ...activeMeetingState(),
          currentElection: {
            id: 1,
            position: 'Treasurer',
            candidates: [],
            requiredVotes: 'majority',
            votingInProgress: true,
            ballotResults: {},
            votersWhoVoted: [],
            elected: null,
          },
        }).valid,
      ).toBe(true);
      // Nominations left open with no position (a state saved before a ballot closed them)
      expect(setAside({ ...activeMeetingState(), nominationsOpen: true }).valid).toBe(true);
      expect(setAside(activeMeetingState())).toEqual({
        valid: false,
        error: 'No election to set aside',
        errorCode: 'NO_ELECTION',
      });
    });
  });

  describe('SET_MEETING_STAGE', () => {
    const setStage = (stage: string, state: MeetingState = activeMeetingState()) =>
      validateAction(state, { type: 'SET_MEETING_STAGE', stage, timestamp: '' } as never);

    it('allows moving to a stage of the order of business', () => {
      expect(setStage('new-business').valid).toBe(true);
    });

    it('rejects a stage that is not in the order of business', () => {
      expect(setStage('adjourned').valid).toBe(false);
      expect(setStage('lunch').valid).toBe(false);
    });

    it('rejects a stage change before the meeting starts', () => {
      expect(setStage('new-business', initialState).errorCode).toBe('MEETING_NOT_ACTIVE');
    });
  });

  describe('SET_QUORUM', () => {
    const setQuorum = (quorum: number) =>
      validateAction(activeMeetingState(), { type: 'SET_QUORUM', quorum, timestamp: '' });

    it('allows a positive whole number', () => {
      expect(setQuorum(5).valid).toBe(true);
    });

    it('rejects zero, negative and fractional quorums', () => {
      expect(setQuorum(0).valid).toBe(false);
      expect(setQuorum(-2).valid).toBe(false);
      expect(setQuorum(2.5).valid).toBe(false);
    });
  });

  describe('MAKE_MOTION', () => {
    describe('secondary amendment (amendAmendment)', () => {
      const motion = (type: string, precedence: number) =>
        ({ id: 1, type, name: type, text: 'x', status: 'active', precedence }) as never;
      const activeState = (current: { type: string; precedence: number }) => ({
        ...initialState,
        meetingActive: true,
        currentMotion: motion(current.type, current.precedence),
        motionStack: [motion('mainMotion', 1), motion(current.type, current.precedence)],
      });
      const makeSecondary = {
        type: 'MAKE_MOTION' as const,
        motionType: 'amendAmendment',
        text: 'by striking "blue"',
        mover: 'Member',
        moverId: 2,
        id: 99,
        timestamp: '',
      };

      it('is in order when a primary amendment is the immediately pending question', () => {
        const result = validateAction(
          activeState({ type: 'amend', precedence: 3 }),
          makeSecondary as never,
        );
        expect(result.valid).toBe(true);
      });

      it('is not in order when no amendment is pending', () => {
        const result = validateAction(
          activeState({ type: 'mainMotion', precedence: 1 }),
          makeSecondary as never,
        );
        expect(result.valid).toBe(false);
      });
    });

    describe('while other business is unsettled', () => {
      const pointOfOrder = {
        type: 'MAKE_MOTION' as const,
        motionType: 'pointOrder',
        text: 'Point of order',
        mover: 'Member 3',
        moverId: 3,
        motionId: 5,
        timestamp: '',
      };

      const adjourn = { ...pointOfOrder, motionType: 'adjourn', text: 'I move to adjourn' };

      it('rejects a motion while a vote is open, so it cannot take over the cast votes', () => {
        const state = { ...activeMeetingState(), votingOpen: true };
        expect(validateAction(state, adjourn).errorCode).toBe('VOTING_IN_PROGRESS');
      });

      it('rejects a motion while another awaits a second, so it is not replaced', () => {
        const state = {
          ...activeMeetingState(),
          pendingSecond: { ...createMotion(), status: 'pending' as const },
        };
        expect(validateAction(state, adjourn).errorCode).toBe('MOTION_PRECEDENCE_VIOLATION');
      });

      it('takes a point of order during a vote and while a motion awaits a second (RONR 23:5)', () => {
        const voting = { ...activeMeetingState(), votingOpen: true };
        expect(validateAction(voting, pointOfOrder)).toEqual({ valid: true });
        const awaiting = {
          ...activeMeetingState(),
          pendingSecond: { ...createMotion(), status: 'pending' as const },
        };
        expect(validateAction(awaiting, pointOfOrder)).toEqual({ valid: true });
      });
    });

    describe('motions that need details', () => {
      const make = (motionType: string, extra: Record<string, unknown> = {}) =>
        validateAction(activeMeetingState(), {
          type: 'MAKE_MOTION',
          motionType,
          text: 'x',
          mover: 'Member 2',
          moverId: 2,
          motionId: 9,
          timestamp: '',
          ...extra,
        } as never);

      it('rejects a bylaw amendment without its details (it would pass and do nothing)', () => {
        expect(make('bylawAmendment').errorCode).toBe('INVALID_ACTION');
      });

      it('rejects amending the agenda without its details', () => {
        const objected = { ...activeMeetingState(), agendaAdopted: false, agendaObjection: true };
        const amend = (extra: Record<string, unknown>) =>
          validateAction(objected, {
            type: 'MAKE_MOTION',
            motionType: 'amendAgenda',
            text: 'x',
            mover: 'Member 2',
            moverId: 2,
            motionId: 9,
            timestamp: '',
            ...extra,
          } as never);
        expect(amend({}).errorCode).toBe('INVALID_ACTION');
        expect(amend({ agendaAmendment: { action: 'add', title: 'Pool' } }).valid).toBe(true);
      });

      it.each([['takeFromTable'], ['reconsider'], ['suspendRules'], ['layOnTable']])(
        'refuses %s, which Robbie does not offer, saying what to do instead',
        (motionType) => {
          expect(make(motionType)).toMatchObject({
            valid: false,
            errorCode: 'MOTION_NOT_OFFERED',
            error: expect.stringContaining("isn't offered in Robbie"),
          });
        },
      );

      it('accepts a bylaw amendment that names its document and change', () => {
        const bylawAmendment = { documentId: 'doc-1', changeType: 'modify', targetSectionId: 's1' };
        expect(make('bylawAmendment', { bylawAmendment }).valid).toBe(true);
      });
    });

    describe('renewing a defeated bylaw amendment', () => {
      const text = 'I move to amend the bylaws by modifying Article I "Name"';
      const defeatedChange = {
        documentId: 'doc-1',
        changeType: 'modify' as const,
        targetSectionId: 'sec-1',
        newContent: 'The Old Society',
      };
      const state: MeetingState = {
        ...activeMeetingState(),
        defeatedMotions: [
          { type: 'bylawAmendment', text, timestamp: '', bylawAmendment: defeatedChange },
        ],
      };
      const propose = (newContent: string) =>
        validateAction(state, {
          type: 'MAKE_MOTION',
          motionType: 'bylawAmendment',
          text,
          mover: 'Member 2',
          moverId: 2,
          bylawAmendment: { ...defeatedChange, newContent },
          timestamp: '',
        } as never);

      it('rejects the same change', () => {
        expect(propose('the old  society').errorCode).toBe('MOTION_RENEWAL_BLOCKED');
      });

      it('allows a different change to the same section', () => {
        expect(propose('The New Society').valid).toBe(true);
      });
    });

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

  describe('changing the words of a pending bylaw amendment', () => {
    const bylaw = {
      ...createMotion(),
      type: 'bylawAmendment',
      category: 'main' as const,
      precedence: 1,
      bylawAmendment: { documentId: 'd', changeType: 'delete' as const },
    };
    const state = () => ({
      ...activeMeetingState(),
      currentMotion: { ...bylaw, secondedBy: 'Member 3' },
      motionStack: [{ ...bylaw, secondedBy: 'Member 3' }],
    });
    it('refuses amend', () => {
      const result = validateAction(state(), {
        type: 'MAKE_MOTION',
        motionType: 'amend',
        text: 'Strike 15 and insert 10',
        mover: 'Member 3',
        moverId: 3,
        motionId: 9,
        timestamp: '',
      });
      expect(result).toMatchObject({
        valid: false,
        errorCode: 'MOTION_PRECEDENCE_VIOLATION',
        error: "A bylaw amendment's words come from its text: withdraw it and move it again",
      });
    });

    it('refuses divideQuestion, which Robbie does not offer', () => {
      const result = validateAction(state(), {
        type: 'MAKE_MOTION',
        motionType: 'divideQuestion',
        text: 'Divide it',
        mover: 'Member 3',
        moverId: 3,
        motionId: 9,
        timestamp: '',
        dividedParts: ['a', 'b'],
      });
      expect(result).toMatchObject({ valid: false, errorCode: 'MOTION_NOT_OFFERED' });
    });

    it('refuses amending an amendment of one', () => {
      const amendment = { ...createMotion({ id: 5 }), type: 'amend', precedence: 3 };
      const result = validateAction(
        { ...state(), currentMotion: amendment, motionStack: [bylaw, amendment] },
        {
          type: 'MAKE_MOTION',
          motionType: 'amendAmendment',
          text: 'x',
          mover: 'Member 3',
          moverId: 3,
          motionId: 9,
          timestamp: '',
        },
      );
      expect(result).toMatchObject({ valid: false, errorCode: 'MOTION_PRECEDENCE_VIOLATION' });
    });
  });

  describe('MODIFY_MOTION', () => {
    it('refuses new words for a bylaw amendment, whose words come from its text', () => {
      const motion = {
        ...createMotion(),
        type: 'bylawAmendment',
        bylawAmendment: { documentId: 'd', changeType: 'delete' as const },
      };
      const state = { ...activeMeetingState(), pendingSecond: motion };
      const result = validateAction(state, {
        type: 'MODIFY_MOTION',
        requesterId: 2,
        newText: 'Fix a typo in 3.2',
        timestamp: '',
      });
      expect(result).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
      // Any other motion's mover can still change its words before debate
      expect(
        validateAction(
          { ...state, pendingSecond: createMotion() },
          { type: 'MODIFY_MOTION', requesterId: 2, newText: 'Paint it blue', timestamp: '' },
        ).valid,
      ).toBe(true);
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

    it('should let a member change their vote before the result is announced', () => {
      // RONR: a member may change a vote until the chair announces the result
      const state = { ...votingState(), voters: [2], voterChoices: { 2: 'yea' as const } };
      const result = validateAction(state, {
        type: 'CAST_VOTE',
        vote: 'nay',
        voterId: 2,
      });
      expect(result.valid).toBe(true);
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

    describe("the chair's deciding vote", () => {
      const decidingVote = (yea: number, nay: number) =>
        validateAction(
          { ...votingState(), votes: { yea, nay, abstain: 0 } },
          { type: 'CAST_VOTE', vote: 'yea', voterId: 1, isChairDecidingVote: true },
        );

      it('is allowed when it would change the result', () => {
        expect(decidingVote(2, 2).valid).toBe(true);
        expect(decidingVote(3, 2).valid).toBe(true);
      });

      it('is not needed on a secret ballot, where the chair votes like any member', () => {
        const result = validateAction(
          { ...votingState(), votingMethod: 'ballot' },
          { type: 'CAST_VOTE', vote: 'nay', voterId: 1 },
        );
        expect(result.valid).toBe(true);
      });

      it('is rejected before anyone has voted or when it would not change the result', () => {
        // The client's isChairDecidingVote flag alone must not let the chair vote
        expect(decidingVote(0, 0).errorCode).toBe('CHAIR_CANNOT_VOTE');
        expect(decidingVote(5, 2).errorCode).toBe('CHAIR_CANNOT_VOTE');
      });
    });
  });

  describe('CAST_PROXY_VOTE', () => {
    // Member 3 gave a proxy to member 2
    const proxyState = (overrides: Partial<MeetingState> = {}): MeetingState => ({
      ...activeMeetingState(),
      votingOpen: true,
      allowProxyVoting: true,
      currentMotion: createMotion(),
      proxies: [
        {
          id: 1,
          grantedBy: 3,
          grantedTo: 2,
          grantedByName: 'Member 3',
          grantedToName: 'Member 2',
          grantedAt: '',
          scope: 'all',
        },
      ],
      ...overrides,
    });
    const castForMember3 = (state: MeetingState) =>
      validateAction(state, {
        type: 'CAST_PROXY_VOTE',
        vote: 'nay',
        forMemberId: 3,
        castById: 2,
        timestamp: '',
      });

    it('allows the holder to vote for the member', () => {
      expect(castForMember3(proxyState()).valid).toBe(true);
    });

    it('allows the holder to change a proxy vote', () => {
      const state = proxyState({
        voters: [3],
        voterChoices: { 3: 'yea' },
        proxyVotes: [{ memberId: 3, castBy: 2, vote: 'yea' }],
      });
      expect(castForMember3(state).valid).toBe(true);
    });

    it('rejects replacing a vote the member cast in person', () => {
      const state = proxyState({ voters: [3], voterChoices: { 3: 'yea' } });
      expect(castForMember3(state).errorCode).toBe('ALREADY_VOTED');
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
      const state = { ...activeMeetingState(), agendaAdopted: false };
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
        agendaAdopted: false,
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
