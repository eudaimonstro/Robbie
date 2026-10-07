import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PRESENCE_GRACE_MS, roomManager } from '../socket/roomManager.js';

const member = { id: 1, name: 'Ann', role: 'member' as const, present: true };

describe('presence grace periods', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    roomManager.cancelGrace('GRACE1', 1);
    roomManager.removeMember('GRACE1', 'socket-1');
    vi.useRealTimers();
  });

  it('run out after PRESENCE_GRACE_MS', () => {
    const onExpire = vi.fn();
    roomManager.startGrace('GRACE1', 1, onExpire);
    expect(roomManager.inGrace('GRACE1', 1)).toBe(true);

    vi.advanceTimersByTime(PRESENCE_GRACE_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledOnce();
    expect(roomManager.inGrace('GRACE1', 1)).toBe(false);
  });

  it('end without effect when the member connects again', () => {
    const onExpire = vi.fn();
    roomManager.startGrace('GRACE1', 1, onExpire);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS / 2);
    roomManager.addMember('GRACE1', 'socket-1', member);

    vi.advanceTimersByTime(PRESENCE_GRACE_MS);
    expect(onExpire).not.toHaveBeenCalled();
    expect(roomManager.inGrace('GRACE1', 1)).toBe(false);
  });

  it('are one per member: starting again starts over', () => {
    const first = vi.fn();
    const second = vi.fn();
    roomManager.startGrace('GRACE1', 1, first);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS / 2);
    roomManager.startGrace('GRACE1', 1, second);

    vi.advanceTimersByTime(PRESENCE_GRACE_MS / 2);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PRESENCE_GRACE_MS / 2);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
