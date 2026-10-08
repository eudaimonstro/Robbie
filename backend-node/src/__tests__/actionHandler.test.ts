import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initialState, meetingReducer } from '@robbie-bylawyer/shared/reducer';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import type { SocketData } from '@robbie-bylawyer/shared/types/socket';

// The meeting as stored; each test sets it
const stored = vi.hoisted(() => ({ state: null as unknown as MeetingState }));
vi.mock('../db/meetingStorage.js', () => ({
  getStorage: () => ({
    getMeeting: async () => ({ id: 1, code: 'TEST01', state: stored.state, stateVersion: 1 }),
    peekMeeting: async () => ({ id: 1, code: 'TEST01', state: stored.state, stateVersion: 1 }),
  }),
}));
// Apply with the real reducer, as the state manager does
const applyAction = vi.hoisted(() =>
  vi.fn(async (_code: string, action: MeetingAction) => ({
    success: true,
    state: meetingReducer(stored.state, action),
    stateVersion: 2,
    changed: true,
  })),
);
vi.mock('../socket/stateManager.js', () => ({
  applyAction,
  DEFERRED_WRITES: new Set(['CAST_VOTE', 'CAST_BALLOT', 'RAISE_HAND', 'LOWER_HAND']),
}));
vi.mock('../bylawyer/bylawSyncService.js', () => ({
  checkAndSyncBylawAmendment: async () => null,
}));
vi.mock('../bylawyer/services/meetingMinutes.js', () => ({
  draftMinutesOnAdjournment: async () => {},
  markPreviousMinutesApproved: async () => {},
}));

const { handleDispatchAction } = await import('../socket/actionHandler.js');
const { forgetBroadcasts } = await import('../socket/statePublisher.js');
const { roomManager } = await import('../socket/roomManager.js');

const question = {
  id: 1,
  type: 'mainMotion',
  name: 'Main Motion',
  text: 'Resurface the pool',
  mover: 'Ann',
  moverId: 2,
  secondedBy: 'Bo',
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
};

function socketOf(data: Partial<SocketData>) {
  return {
    data: {
      userId: 2,
      email: 'ann@example.org',
      name: 'Ann',
      sessionId: 's-1',
      meetingCode: 'TEST01',
      role: 'member',
      ...data,
    } as SocketData,
    emit: vi.fn(),
  };
}

async function dispatch(socket: ReturnType<typeof socketOf>, action: unknown) {
  const emit = vi.fn();
  const io = { to: vi.fn(() => ({ emit })), in: () => ({ fetchSockets: async () => [] }) };
  const callback = vi.fn();
  await handleDispatchAction(
    socket as never,
    io as never,
    { action: action as unknown as MeetingAction, clientSequence: 1 },
    callback,
  );
  return { callback, emit };
}

describe('handleDispatchAction', () => {
  beforeEach(() => {
    // Each test's first update goes out at once
    forgetBroadcasts();
    applyAction.mockClear();
    stored.state = {
      ...initialState,
      meetingCode: 'TEST01',
      meetingActive: true,
      quorum: 3,
      members: [
        { id: 1, name: 'Chair', role: 'chair', present: true, presentBy: 'device' },
        { id: 2, name: 'Ann', role: 'member', present: true, presentBy: 'device' },
        { id: 9, name: 'Guest', role: 'guest', present: true, presentBy: 'device' },
      ],
      currentMotion: question,
      motionStack: [question],
    };
  });

  it('refuses every action from a display', async () => {
    const { callback } = await dispatch(socketOf({ role: 'guest', display: true }), {
      type: 'RAISE_HAND',
      stance: 'pro',
    });
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, errorCode: 'PERMISSION_DENIED' }),
    );
    expect(applyAction).not.toHaveBeenCalled();
  });

  it.each([
    { type: 'CAST_VOTE', vote: 'yea' },
    { type: 'MAKE_MOTION', motionType: 'mainMotion', text: 'Paint the clubhouse' },
    { type: 'SECOND_MOTION' },
  ])("refuses a guest's $type", async (action) => {
    const { callback } = await dispatch(socketOf({ userId: 9, role: 'guest' }), action);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, errorCode: 'PERMISSION_DENIED' }),
    );
    expect(applyAction).not.toHaveBeenCalled();
  });

  it('opens a vote without a warning when the headcount makes the quorum', async () => {
    // Two members on devices (the guest doesn't count) and one person counted by the chair
    stored.state = { ...stored.state, headcount: 1 };
    await dispatch(socketOf({ userId: 1, role: 'chair' }), {
      type: 'OPEN_VOTING',
      voteTimerEnd: null,
      timestamp: '',
    });
    expect(applyAction.mock.calls[0][1]).not.toHaveProperty('withoutQuorum');
  });

  it('warns when a vote opens without a quorum, guests not counted', async () => {
    await dispatch(socketOf({ userId: 1, role: 'chair' }), {
      type: 'OPEN_VOTING',
      voteTimerEnd: null,
      timestamp: '',
    });
    expect(applyAction.mock.calls[0][1]).toMatchObject({ withoutQuorum: true });
  });

  it("ends a member's grace period on MARK_ABSENT only once the action is applied", async () => {
    const markAbsent = () =>
      dispatch(socketOf({ userId: 1, role: 'chair' }), {
        type: 'MARK_ABSENT',
        memberId: 2,
        excused: false,
        timestamp: '',
      });
    roomManager.startGrace('TEST01', 2, () => {});

    applyAction.mockImplementationOnce(
      async () =>
        ({
          success: false,
          error: 'State was modified by another user. Please try again.',
          errorCode: 'CONCURRENCY_CONFLICT',
        }) as never,
    );
    expect((await markAbsent()).callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
    // Not applied: the member would otherwise stay present with no grace period to end it
    expect(roomManager.inGrace('TEST01', 2)).toBe(true);

    expect((await markAbsent()).callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
    expect(roomManager.inGrace('TEST01', 2)).toBe(false);
  });

  it("doesn't broadcast who voted which way on a secret ballot", async () => {
    stored.state = {
      ...stored.state,
      votingOpen: true,
      votingMethod: 'ballot',
      voters: [1],
      voterChoices: { 1: 'nay' },
      votes: { yea: 0, nay: 1, abstain: 0 },
    };
    const { emit } = await dispatch(socketOf({}), { type: 'CAST_VOTE', vote: 'yea' });
    const [event, update] = emit.mock.calls[0];
    expect(event).toBe('STATE_UPDATE');
    // Neither the running totals, nor who just voted: only that two have
    expect(update.state.votes).toEqual({ yea: 0, nay: 0, abstain: 0 });
    expect(update.state.voterChoices).toEqual({});
    expect(update.state.voters).toEqual([1, 2]);
    expect(update.triggeredBy).toEqual({ actionType: 'CAST_VOTE', userId: 0 });
  });

  describe('refuses a malformed action before anything reads it', () => {
    it.each([
      ['a prototype key as a stance, from a guest', 9, { type: 'RAISE_HAND', stance: '__proto__' }],
      [
        'an object as motion text',
        2,
        {
          type: 'MAKE_MOTION',
          motionType: 'mainMotion',
          text: { length: 3 },
          motionId: 1,
          timestamp: '',
        },
      ],
      ['a megabyte vote', 2, { type: 'CAST_VOTE', vote: 'y'.repeat(1024 * 1024) }],
      ['a prototype key as the type', 2, { type: '__proto__' }],
      ['a type no action has', 2, { type: 'constructor' }],
    ])('%s', async (_label, userId, action) => {
      stored.state = { ...stored.state, votingOpen: true };
      const before = structuredClone(stored.state);
      const socket = socketOf({ userId, role: userId === 9 ? 'guest' : 'member' });
      const { callback, emit } = await dispatch(socket, action);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
      expect(socket.emit).toHaveBeenCalledWith(
        'ACTION_REJECTED',
        expect.objectContaining({ clientSequence: 1 }),
      );
      // Nothing reached the state, and nothing went to the room
      expect(applyAction).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
      expect(stored.state).toEqual(before);
    });
  });

  it('refuses a vote from a member marked absent, as the validator checks it', async () => {
    stored.state = {
      ...stored.state,
      votingOpen: true,
      members: stored.state.members.map((m) => (m.id === 2 ? { ...m, present: false } : m)),
    };
    const { callback } = await dispatch(socketOf({}), { type: 'CAST_VOTE', vote: 'yea' });
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, errorCode: 'NOT_PRESENT' }),
    );
    expect(applyAction).not.toHaveBeenCalled();
  });

  it('refuses a ballot from a member marked absent', async () => {
    stored.state = {
      ...stored.state,
      currentMotion: null,
      motionStack: [],
      currentElection: {
        id: 5,
        position: 'Director',
        candidates: [{ name: 'Carmen Diaz', id: 0 }],
        requiredVotes: 'majority',
        votingInProgress: true,
        ballotResults: {},
        votersWhoVoted: [],
        elected: null,
      },
      members: stored.state.members.map((m) => (m.id === 2 ? { ...m, present: false } : m)),
    };
    const { callback } = await dispatch(socketOf({}), {
      type: 'CAST_BALLOT',
      candidateName: 'Carmen Diaz',
    });
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, errorCode: 'NOT_PRESENT' }),
    );
    expect(applyAction).not.toHaveBeenCalled();
  });
});
