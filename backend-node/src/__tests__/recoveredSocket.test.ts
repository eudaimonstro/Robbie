import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState } from '@robbie-bylawyer/shared/types';

const stored = vi.hoisted(() => ({ state: null as unknown as MeetingState }));
vi.mock('../db/meetingStorage.js', () => ({
  getStorage: () => ({ getMeeting: async () => ({ state: stored.state, stateVersion: 5 }) }),
}));
const applyAction = vi.hoisted(() =>
  vi.fn(async () => ({ success: true, state: stored.state, stateVersion: 6 })),
);
vi.mock('../socket/stateManager.js', () => ({ applyAction }));

const { roomManager } = await import('../socket/roomManager.js');
const { handleRecoveredSocket } = await import('../socket/joinHandler.js');

function recovered(data: Record<string, unknown> = {}) {
  return {
    id: 'recovered-socket',
    data: { meetingCode: 'REC001', userId: 3, name: 'Ann', role: 'member', ...data },
  };
}

describe('handleRecoveredSocket', () => {
  const emit = vi.fn();
  const io = { to: () => ({ emit }) };

  beforeEach(() => {
    applyAction.mockClear();
    emit.mockClear();
    roomManager.removeMember('REC001', 'recovered-socket');
  });

  it('counts the member connected again, which ends their grace period', async () => {
    stored.state = {
      ...initialState,
      members: [{ id: 3, name: 'Ann', role: 'member', present: true, presentBy: 'device' }],
    };
    roomManager.startGrace('REC001', 3, () => {});

    await handleRecoveredSocket(recovered() as never, io as never);

    expect(roomManager.isMemberConnected('REC001', 3)).toBe(true);
    expect(roomManager.inGrace('REC001', 3)).toBe(false);
    expect(applyAction).not.toHaveBeenCalled();
  });

  it('marks the member present again when the grace period ran out meanwhile', async () => {
    stored.state = {
      ...initialState,
      members: [{ id: 3, name: 'Ann', role: 'member', present: false }],
    };

    await handleRecoveredSocket(recovered() as never, io as never);

    expect(applyAction).toHaveBeenCalledWith(
      'REC001',
      expect.objectContaining({ type: 'SET_MEMBER_PRESENCE', memberId: 3, present: true }),
    );
    expect(emit).toHaveBeenCalledWith('STATE_UPDATE', expect.objectContaining({ stateVersion: 6 }));
  });

  it('does nothing for a display', async () => {
    await handleRecoveredSocket(recovered({ display: true }) as never, io as never);
    expect(roomManager.isMemberConnected('REC001', 3)).toBe(false);
  });
});
