import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import type { ValidationResult } from '../socket/stateManager.js';

const member: Member = {
  id: 1,
  name: 'Member',
  role: 'member',
  present: true,
  presentBy: 'device',
};
const stored = vi.hoisted(() => ({ state: null as unknown as MeetingState }));

// Applies the action's check against the stored state, as the state manager does
const applyAction = vi.hoisted(() =>
  vi.fn(
    async (
      _code: string,
      _action: MeetingAction,
      validator?: (s: MeetingState, a: MeetingAction) => ValidationResult,
    ) => {
      const validation = validator?.(stored.state, _action) ?? { valid: true };
      return validation.valid
        ? { success: true, state: stored.state, stateVersion: 2 }
        : { success: false, error: validation.error };
    },
  ),
);
vi.mock('../socket/stateManager.js', () => ({ applyAction }));

const { PRESENCE_GRACE_MS, roomManager } = await import('../socket/roomManager.js');
const { handleDisconnect } = await import('../socket/disconnectHandler.js');
const { actionRateLimiter, joinRateLimiter } = await import('../socket/rateLimiter.js');

function fakeSocket(id: string, userId = 1) {
  return {
    id,
    data: { meetingCode: 'TEST01', userId, name: 'Member', email: 'm@x', role: 'member' },
    leave: vi.fn(),
  };
}

describe('handleDisconnect', () => {
  const emit = vi.fn();
  const io = { to: () => ({ emit }) };

  beforeEach(() => {
    vi.useFakeTimers();
    applyAction.mockClear();
    emit.mockClear();
    stored.state = { ...initialState, members: [member] };
    roomManager.addMember('TEST01', 'old-socket', member);
  });
  afterEach(() => {
    roomManager.removeMember('TEST01', 'old-socket');
    roomManager.removeMember('TEST01', 'new-socket');
    roomManager.cancelGrace('TEST01', 1);
    vi.useRealTimers();
  });

  describe('when the connection drops', () => {
    it('marks the member absent only once the grace period has passed', async () => {
      const socket = fakeSocket('old-socket');
      await handleDisconnect(socket as never, io as never, 'disconnect');
      expect(applyAction).not.toHaveBeenCalled();
      // Connection state recovery may bring the socket back with its meeting
      expect(socket.data.meetingCode).toBe('TEST01');

      await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS);
      expect(applyAction).toHaveBeenCalledWith(
        'TEST01',
        expect.objectContaining({ type: 'SET_MEMBER_PRESENCE', memberId: 1, present: false }),
        expect.any(Function),
      );
      expect(emit).toHaveBeenCalledWith('STATE_UPDATE', expect.anything());
      expect(emit).toHaveBeenCalledWith('MEMBER_LEFT', expect.anything());
    });

    it('changes nothing when the member reconnects within the grace period', async () => {
      await handleDisconnect(fakeSocket('old-socket') as never, io as never, 'disconnect');
      await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS / 3);
      roomManager.addMember('TEST01', 'new-socket', member);

      await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS);
      expect(applyAction).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('leaves a member the chair marked present', async () => {
      stored.state = { ...initialState, members: [{ ...member, presentBy: 'chair' }] };
      await handleDisconnect(fakeSocket('old-socket') as never, io as never, 'disconnect');
      await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS);
      expect(applyAction).toHaveBeenCalledOnce();
      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('when the member leaves', () => {
    it('marks them absent at once, and the socket leaves the meeting', async () => {
      const socket = fakeSocket('old-socket');
      await handleDisconnect(socket as never, io as never, 'leave');
      expect(applyAction).toHaveBeenCalledOnce();
      expect(emit).toHaveBeenCalledWith('STATE_UPDATE', expect.anything());
      expect(socket.leave).toHaveBeenCalledWith('meeting:TEST01');
      // Leaving a meeting doesn't sign the socket out
      expect(socket.data.userId).toBe(1);
      expect(socket.data.meetingCode).toBeNull();
    });

    it('leaves a member present who reconnects before the write is applied', async () => {
      applyAction.mockImplementationOnce(async (_code, action, validator) => {
        roomManager.addMember('TEST01', 'new-socket', member);
        const validation = validator!(stored.state, action);
        return { success: validation.valid, error: validation.error } as never;
      });
      await handleDisconnect(fakeSocket('old-socket') as never, io as never, 'leave');
      expect(emit).not.toHaveBeenCalled();
    });
  });

  it('does nothing to presence for a display', async () => {
    const socket = {
      ...fakeSocket('display-socket'),
      data: { ...fakeSocket('x').data, display: true },
    };
    await handleDisconnect(socket as never, io as never, 'leave');
    expect(applyAction).not.toHaveBeenCalled();
    expect(socket.leave).toHaveBeenCalledWith('meeting:TEST01');
    expect(socket.data.meetingCode).toBeNull();
  });

  it("forgets a display socket's room entry, left from when it was a member's", async () => {
    const socket = {
      ...fakeSocket('old-socket'),
      data: { ...fakeSocket('x').data, display: true },
    };
    await handleDisconnect(socket as never, io as never, 'disconnect');
    expect(roomManager.isMemberConnected('TEST01', 1)).toBe(false);
  });

  it("doesn't reset the user's join or action allowance when they leave", async () => {
    const userId = 42;
    roomManager.addMember('TEST01', 'spender', { ...member, id: userId });
    while (joinRateLimiter.consume(userId));
    while (actionRateLimiter.consume(userId));

    await handleDisconnect(fakeSocket('spender', userId) as never, io as never, 'leave');

    // Leaving and joining again must not buy a fresh allowance
    expect(joinRateLimiter.getRemaining(userId)).toBe(0);
    expect(actionRateLimiter.getRemaining(userId)).toBe(0);
  });
});
