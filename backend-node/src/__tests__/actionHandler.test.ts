import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initialState, meetingReducer } from '@robbie-bylawyer/shared/reducer';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import type { SocketData } from '@robbie-bylawyer/shared/types/socket';

// The meeting as stored; each test sets it
const stored = vi.hoisted(() => ({ state: null as unknown as MeetingState }));
vi.mock('../db/meetingStorage.js', () => ({
  getStorage: () => ({
    getMeeting: async () => ({ id: 1, code: 'TEST01', state: stored.state, stateVersion: 1 }),
  }),
}));
// Apply with the real reducer, as the state manager does
const applyAction = vi.hoisted(() =>
  vi.fn(async (_code: string, action: MeetingAction) => ({
    success: true,
    state: meetingReducer(stored.state, action),
    stateVersion: 2,
  })),
);
vi.mock('../socket/stateManager.js', () => ({ applyAction }));
vi.mock('../bylawyer/bylawSyncService.js', () => ({
  checkAndSyncBylawAmendment: async () => null,
}));

const { handleDispatchAction } = await import('../socket/actionHandler.js');

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

async function dispatch(socket: ReturnType<typeof socketOf>, action: Record<string, unknown>) {
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
});
