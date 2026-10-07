import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockSockets: Array<{
  opts: { auth?: { token?: string } };
  emit: jest.Mock;
  disconnect: jest.Mock;
  handlers: Record<string, (...a: unknown[]) => void>;
}> = [];
jest.mock('socket.io-client', () => ({
  io: jest.fn((_url: string, opts: { auth?: { token?: string } }) => {
    const socket = {
      opts,
      handlers: {} as Record<string, (...a: unknown[]) => void>,
      connected: false,
      on(event: string, handler: (...a: unknown[]) => void) {
        socket.handlers[event] = handler;
        return socket;
      },
      emit: jest.fn(),
      disconnect: jest.fn(),
      connect: jest.fn(),
    };
    mockSockets.push(socket);
    return socket;
  }),
}));
jest.mock('../../lib/storage', () => ({
  getMeetingCode: jest.fn(async () => null),
  storeMeetingCode: jest.fn(async () => {}),
}));
const mockSignOut = jest.fn();
const mockMarkTermsNotAccepted = jest.fn();
let mockUser = { id: 1, email: 'a@b.c', name: 'Ann' };
let mockTermsAccepted = true;
jest.mock('../../context/SessionContext', () => ({
  useSession: () => ({
    token: 'tok',
    user: mockUser,
    termsAccepted: mockTermsAccepted,
    signOut: mockSignOut,
    markTermsNotAccepted: mockMarkTermsNotAccepted,
  }),
}));

import * as storage from '../../lib/storage';
import { SocketProvider, useSocket } from '../../context/SocketContext';

const wrapper = ({ children }: { children: ReactNode }) => (
  <SocketProvider>{children}</SocketProvider>
);

describe('SocketProvider (mobile)', () => {
  beforeEach(() => {
    mockSockets.length = 0;
    mockUser = { id: 1, email: 'a@b.c', name: 'Ann' };
    mockTermsAccepted = true;
    jest.clearAllMocks();
  });

  it('joins by code with the session token in the handshake', async () => {
    const { result } = await renderHook(() => useSocket(), { wrapper });
    await act(async () => result.current.joinMeeting('demo'));
    await waitFor(() => expect(mockSockets.length).toBe(1));
    expect(mockSockets[0].opts.auth).toEqual({ token: 'tok' });
    await act(() => mockSockets[0].handlers.connect());
    expect(mockSockets[0].emit).toHaveBeenCalledWith(
      'JOIN_MEETING',
      { meetingCode: 'DEMO' },
      expect.any(Function),
    );
    expect(storage.storeMeetingCode).toHaveBeenCalledWith(1, 'DEMO');
  });

  it("rejoins the user's remembered meeting after a restart", async () => {
    (storage.getMeetingCode as jest.Mock).mockImplementation(async (userId: number) =>
      userId === 1 ? 'DEMO' : null,
    );
    const { result } = await renderHook(() => useSocket(), { wrapper });
    await waitFor(() => expect(mockSockets.length).toBe(1));
    expect(storage.getMeetingCode).toHaveBeenCalledWith(1);
    expect(result.current.meetingCode).toBe('DEMO');
    await act(() => mockSockets[0].handlers.connect());
    expect(mockSockets[0].emit).toHaveBeenCalledWith(
      'JOIN_MEETING',
      { meetingCode: 'DEMO' },
      expect.any(Function),
    );
  });

  it("doesn't rejoin a meeting another user joined on this phone", async () => {
    (storage.getMeetingCode as jest.Mock).mockImplementation(async (userId: number) =>
      userId === 1 ? 'DEMO' : null,
    );
    mockUser = { id: 2, email: 'b@b.c', name: 'Bob' };
    const { result } = await renderHook(() => useSocket(), { wrapper });
    await act(async () => {});
    expect(storage.getMeetingCode).toHaveBeenCalledWith(2);
    expect(result.current.meetingCode).toBeNull();
    expect(mockSockets).toHaveLength(0);
  });

  it('signs out when the server no longer accepts the session', async () => {
    const { result } = await renderHook(() => useSocket(), { wrapper });
    await act(async () => result.current.joinMeeting('DEMO'));
    await waitFor(() => expect(mockSockets.length).toBe(1));
    await act(() => mockSockets[0].handlers.connect_error(new Error('Not signed in')));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('shows an error when the server ends the connection', async () => {
    const { result } = await renderHook(() => useSocket(), { wrapper });
    await act(async () => result.current.joinMeeting('DEMO'));
    await waitFor(() => expect(mockSockets.length).toBe(1));
    await act(() => mockSockets[0].handlers.disconnect('transport close'));
    expect(result.current.error).toBeNull();
    await act(() => mockSockets[0].handlers.disconnect('io server disconnect'));
    expect(result.current.error).toBe('Disconnected by the server.');
  });

  it('ignores a state update older than the one on screen', async () => {
    const { result } = await renderHook(() => useSocket(), { wrapper });
    await act(async () => result.current.joinMeeting('DEMO'));
    await waitFor(() => expect(mockSockets.length).toBe(1));
    await act(() => mockSockets[0].handlers.connect());
    const ack = mockSockets[0].emit.mock.calls[0][2] as (response: unknown) => void;
    const state = result.current.state;
    await act(() => ack({ success: true, state: { ...state, quorum: 7 }, stateVersion: 5 }));
    expect(result.current.isConnected).toBe(true);
    await act(() =>
      mockSockets[0].handlers.STATE_UPDATE({
        state: { ...state, quorum: 2 },
        stateVersion: 3,
      }),
    );
    expect(result.current.state.quorum).toBe(7);
  });

  it('leaves the meeting and forgets it', async () => {
    const { result } = await renderHook(() => useSocket(), { wrapper });
    await act(async () => result.current.joinMeeting('DEMO'));
    await waitFor(() => expect(mockSockets.length).toBe(1));
    await act(async () => result.current.leaveMeeting());
    expect(mockSockets[0].emit).toHaveBeenCalledWith('LEAVE_MEETING');
    expect(mockSockets[0].disconnect).toHaveBeenCalled();
    expect(storage.storeMeetingCode).toHaveBeenLastCalledWith(1, null);
    expect(result.current.meetingCode).toBeNull();
  });

  it('sends the user to the terms screen when the connection is refused for the terms', async () => {
    const { result } = await renderHook(() => useSocket(), { wrapper });
    await act(async () => result.current.joinMeeting('DEMO'));
    await waitFor(() => expect(mockSockets.length).toBe(1));
    await act(() =>
      mockSockets[0].handlers.connect_error(
        Object.assign(new Error('Accept the terms to continue'), {
          data: { code: 'TERMS_NOT_ACCEPTED' },
        }),
      ),
    );
    expect(mockMarkTermsNotAccepted).toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("doesn't connect until the current terms are accepted", async () => {
    mockTermsAccepted = false;
    const { result } = await renderHook(() => useSocket(), { wrapper });
    await act(async () => result.current.joinMeeting('DEMO'));
    expect(mockSockets).toHaveLength(0);
  });
});
