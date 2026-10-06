import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import type { ValidationResult } from '../socket/stateManager.js';

const member = { id: 1, name: 'Member', role: 'member' as const, present: true };
const state: MeetingState = { ...initialState, members: [member] };

// Before the queued presence write runs, the member's refreshed page connects again
const applyAction = vi.fn(
  async (
    _code: string,
    action: MeetingAction,
    validator?: (s: MeetingState, a: MeetingAction) => ValidationResult,
  ) => {
    roomManager.addMember('TEST01', 'new-socket', member);
    const validation = validator?.(state, action) ?? { valid: true };
    return validation.valid
      ? { success: true, state, stateVersion: 2 }
      : { success: false, error: validation.error };
  },
);
vi.mock('../socket/stateManager.js', () => ({ applyAction }));

const { roomManager } = await import('../socket/roomManager.js');
const { handleDisconnect } = await import('../socket/disconnectHandler.js');

describe('handleDisconnect', () => {
  beforeEach(() => {
    roomManager.removeMember('TEST01', 'new-socket');
    roomManager.addMember('TEST01', 'old-socket', member);
  });

  it('leaves a member present who reconnects before the disconnect is applied', async () => {
    const emit = vi.fn();
    const socket = {
      id: 'old-socket',
      data: { meetingCode: 'TEST01', userId: 1, name: 'Member', email: 'm@x', role: 'member' },
      to: () => ({ emit }),
      leave: vi.fn(),
    };
    const io = { to: () => ({ emit }) };

    await handleDisconnect(socket as never, io as never);

    expect(applyAction).toHaveBeenCalledOnce();
    expect(emit).not.toHaveBeenCalledWith('STATE_UPDATE', expect.anything());
  });
});
