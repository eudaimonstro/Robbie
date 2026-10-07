import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';

type Validator = (state: MeetingState) => { valid: boolean };
const stored = vi.hoisted(() => ({ state: null as unknown as MeetingState }));
const applyAction = vi.hoisted(() =>
  vi.fn(async (_code: string, _action: unknown, validator?: Validator) => ({
    success: validator ? validator(stored.state).valid : true,
    state: stored.state,
    stateVersion: 2,
  })),
);
vi.mock('../socket/stateManager.js', () => ({ applyAction }));
vi.mock('../db/meetingStorage.js', () => ({
  getStorage: () => ({ getMeeting: async () => ({ state: stored.state, stateVersion: 1 }) }),
}));

const { PRESENCE_GRACE_MS, roomManager } = await import('../socket/roomManager.js');
const { markDisconnectedMembersAbsent, scheduleReconcile } =
  await import('../socket/presenceReconciler.js');

const member = (id: number, present: boolean, presentBy?: 'device' | 'chair'): Member => ({
  id,
  name: `Member ${id}`,
  role: 'member',
  present,
  ...(presentBy ? { presentBy } : {}),
});

describe('markDisconnectedMembersAbsent', () => {
  beforeEach(() => {
    applyAction.mockClear();
    roomManager.removeMember('RECON1', 'socket-1');
    roomManager.removeMember('RECON1', 'socket-2');
    roomManager.cancelGrace('RECON1', 4);
  });

  it('marks absent the members left present on a device with no connection (after a restart)', async () => {
    roomManager.addMember('RECON1', 'socket-1', member(1, true));
    stored.state = {
      ...initialState,
      members: [
        member(1, true, 'device'),
        member(2, true, 'device'),
        member(3, false),
        member(5, true), // saved before presentBy existed: on a device
      ],
    };

    await markDisconnectedMembersAbsent('RECON1', stored.state);

    expect(
      applyAction.mock.calls.map((call) => (call[1] as { memberId: number }).memberId),
    ).toEqual([2, 5]);
  });

  it('leaves members the chair marked present, and members within their grace period', async () => {
    roomManager.startGrace('RECON1', 4, () => {});
    stored.state = {
      ...initialState,
      members: [member(3, true, 'chair'), member(4, true, 'device')],
    };
    expect(await markDisconnectedMembersAbsent('RECON1', stored.state)).toBeNull();
    expect(applyAction).not.toHaveBeenCalled();
  });

  it('leaves a member alone who reconnects before the write is applied', async () => {
    stored.state = { ...initialState, members: [member(2, true, 'device')] };
    applyAction.mockImplementationOnce(async (_code, _action, validator) => {
      roomManager.addMember('RECON1', 'socket-2', member(2, true));
      return { success: validator!(stored.state).valid, state: stored.state, stateVersion: 2 };
    });

    const result = await markDisconnectedMembersAbsent('RECON1', stored.state);

    expect(result).toBeNull();
  });
});

describe('scheduleReconcile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    applyAction.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('waits the grace period, then marks the stale members absent and sends the state', async () => {
    stored.state = { ...initialState, members: [member(7, true, 'device')] };
    const emit = vi.fn();
    const io = { to: vi.fn(() => ({ emit })) };

    scheduleReconcile(io as never, 'RECON2');
    scheduleReconcile(io as never, 'RECON2'); // one waits per meeting
    await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS - 1);
    expect(applyAction).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(applyAction).toHaveBeenCalledOnce();
    expect(io.to).toHaveBeenCalledWith('meeting:RECON2');
    expect(emit).toHaveBeenCalledWith('STATE_UPDATE', expect.anything());
  });
});
