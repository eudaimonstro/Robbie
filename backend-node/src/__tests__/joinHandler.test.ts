import { describe, it, expect, vi } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';

const handleDisconnect = vi.hoisted(() =>
  vi.fn(async (socket: { data: Record<string, unknown> }) => {
    socket.data.meetingCode = null;
  }),
);
vi.mock('../socket/disconnectHandler.js', () => ({ handleDisconnect }));
vi.mock('../db/meetingStorage.js', () => ({
  getStorage: () => ({
    getOrCreateMeeting: async () => ({ code: 'NEW1', state: initialState, stateVersion: 1 }),
    getParticipantRole: async () => 'member',
    setParticipantRole: async () => {},
  }),
}));
vi.mock('../socket/stateManager.js', () => ({
  applyAction: async () => ({ success: true, state: initialState, stateVersion: 2 }),
}));
vi.mock('../socket/presenceReconciler.js', () => ({
  markDisconnectedMembersAbsent: async () => null,
}));

const { handleJoinMeeting } = await import('../socket/joinHandler.js');

describe('handleJoinMeeting', () => {
  it('leaves the meeting a socket is already in before joining another', async () => {
    const emit = vi.fn();
    const socket = {
      id: 'socket-1',
      data: {
        meetingCode: 'OLD1',
        userId: 7,
        name: 'Member',
        email: 'm@x.org',
        role: 'member',
        sessionId: 's-1',
      },
      handshake: { headers: {} },
      join: vi.fn(),
      to: () => ({ emit }),
    };
    const io = { to: () => ({ emit }) };
    const callback = vi.fn();

    await handleJoinMeeting(socket as never, io as never, { meetingCode: 'NEW1' }, callback);

    // Otherwise it kept receiving the old meeting's updates and stayed present there
    expect(handleDisconnect).toHaveBeenCalledOnce();
    expect(socket.join).toHaveBeenCalledWith('meeting:NEW1');
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects a malformed meeting code without leaving or joining anything', async () => {
    handleDisconnect.mockClear();
    const emit = vi.fn();
    const socket = {
      id: 'socket-2',
      data: {
        meetingCode: 'OLD1',
        userId: 8,
        name: 'Member',
        email: 'm2@x.org',
        role: 'member',
        sessionId: 's-2',
      },
      join: vi.fn(),
      to: () => ({ emit }),
    };
    const io = { to: () => ({ emit }) };
    const callback = vi.fn();

    await handleJoinMeeting(socket as never, io as never, { meetingCode: 'bad code!' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(handleDisconnect).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });
});
