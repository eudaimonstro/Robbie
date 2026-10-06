import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState } from '@robbie-bylawyer/shared/types';

type Validator = (state: MeetingState) => { valid: boolean };
const applyAction = vi.fn(
  async (_code: string, _action: unknown, _validator?: Validator) =>
    ({ success: true, state: initialState, stateVersion: 2 }) as {
      success: boolean;
      state: MeetingState;
      stateVersion: number;
    },
);
vi.mock('../socket/stateManager.js', () => ({ applyAction }));

const { roomManager } = await import('../socket/roomManager.js');
const { markDisconnectedMembersAbsent } = await import('../socket/presenceReconciler.js');

const member = (id: number, present: boolean) => ({
  id,
  name: `Member ${id}`,
  role: 'member' as const,
  present,
});

describe('markDisconnectedMembersAbsent', () => {
  beforeEach(() => {
    applyAction.mockClear();
    roomManager.removeMember('RECON1', 'socket-1');
    roomManager.removeMember('RECON1', 'socket-2');
  });

  it('marks absent the members left present with no connection (after a restart, say)', async () => {
    roomManager.addMember('RECON1', 'socket-1', member(1, true));
    const state: MeetingState = {
      ...initialState,
      members: [member(1, true), member(2, true), member(3, false)],
    };

    await markDisconnectedMembersAbsent('RECON1', state);

    expect(applyAction).toHaveBeenCalledOnce();
    expect(applyAction).toHaveBeenCalledWith(
      'RECON1',
      expect.objectContaining({ type: 'SET_MEMBER_PRESENCE', memberId: 2, present: false }),
      expect.any(Function),
    );
  });

  it('leaves a member alone who reconnects before the write is applied', async () => {
    const state: MeetingState = { ...initialState, members: [member(2, true)] };
    applyAction.mockImplementationOnce(async (_code, _action, validator) => {
      roomManager.addMember('RECON1', 'socket-2', member(2, true));
      return { success: validator!(state).valid, state, stateVersion: 2 };
    });

    const result = await markDisconnectedMembersAbsent('RECON1', state);

    expect(result).toBeNull();
  });
});
