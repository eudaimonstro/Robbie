import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { SocketProvider, useSocket } from '../SocketContext';

type Handler = (...args: unknown[]) => void;

interface FakeSocket {
  connected: boolean;
  handlers: Record<string, Handler>;
  on: (event: string, handler: Handler) => FakeSocket;
  emit: (event: string, ...args: unknown[]) => void;
  connect: () => void;
  disconnect: () => void;
}

const sockets: FakeSocket[] = [];

// Minimal stand-in for a socket.io client: connects on the next tick and answers
// JOIN_MEETING successfully, the way the server does for a valid token.
function createFakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    connected: false,
    handlers: {},
    on(event, handler) {
      socket.handlers[event] = handler;
      return socket;
    },
    emit(event, ...args) {
      if (event === 'JOIN_MEETING') {
        const callback = args[1] as Handler;
        setTimeout(() =>
          callback({
            success: true,
            state: { ...initialState, meetingCode: 'DEMO' },
            members: [],
          }),
        );
      }
    },
    connect() {},
    disconnect() {
      socket.connected = false;
    },
  };
  setTimeout(() => {
    socket.connected = true;
    socket.handlers.connect?.();
  });
  sockets.push(socket);
  return socket;
}

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => createFakeSocket()),
}));

function ConnectionStatus() {
  const { isConnected } = useSocket();
  return <div>{isConnected ? 'connected' : 'connecting'}</div>;
}

describe('SocketProvider', () => {
  beforeEach(() => {
    sockets.length = 0;
    localStorage.setItem(
      'robbie_auth',
      JSON.stringify({
        token: 'test-token',
        meetingCode: 'DEMO',
        email: 'chair@example.com',
        name: 'Test Chair',
        userId: 1,
      }),
    );
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('opens one socket and keeps it after joining the meeting', async () => {
    render(
      <SocketProvider>
        <ConnectionStatus />
      </SocketProvider>,
    );

    await screen.findByText('connected');
    // Give a reconnect loop time to show itself
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));

    expect(sockets).toHaveLength(1);
    expect(sockets[0].connected).toBe(true);
  });

  it('keeps the same socket when the server sends a state update', async () => {
    render(
      <SocketProvider>
        <ConnectionStatus />
      </SocketProvider>,
    );
    await screen.findByText('connected');

    act(() => {
      sockets[0].handlers.STATE_UPDATE?.({
        state: { ...initialState, meetingCode: 'DEMO', meetingActive: true },
      });
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));

    await waitFor(() => expect(sockets).toHaveLength(1));
    expect(sockets[0].connected).toBe(true);
  });
});
