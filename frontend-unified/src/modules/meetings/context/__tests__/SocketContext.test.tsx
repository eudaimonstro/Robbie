import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { SocketProvider, useSocket } from '../SocketContext';

vi.mock('../../../../context/SessionContext', () => ({
  useSession: () => ({
    status: 'signedIn',
    user: { id: 1, email: 'chair@example.com', name: 'Test Chair' },
  }),
}));

type Handler = (...args: unknown[]) => void;

interface FakeSocket {
  connected: boolean;
  handlers: Record<string, Handler>;
  emitted: { event: string; data: unknown }[];
  on: (event: string, handler: Handler) => FakeSocket;
  emit: (event: string, ...args: unknown[]) => void;
  connect: () => void;
  disconnect: () => void;
}

const sockets: FakeSocket[] = [];

// Minimal stand-in for a socket.io client: connects on the next tick and answers
// JOIN_MEETING successfully, the way the server does for a signed-in user.
function createFakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    connected: false,
    handlers: {},
    emitted: [],
    on(event, handler) {
      socket.handlers[event] = handler;
      return socket;
    },
    emit(event, ...args) {
      socket.emitted.push({ event, data: args[0] });
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

function MeetingStatus() {
  const { isConnected, meetingCode, joinMeeting, leaveMeeting } = useSocket();
  return (
    <div>
      <p>{isConnected ? 'connected' : 'not connected'}</p>
      <p>Code: {meetingCode ?? 'none'}</p>
      <button onClick={() => joinMeeting('DEMO')}>Join</button>
      <button onClick={leaveMeeting}>Leave</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <SocketProvider>
      <MeetingStatus />
    </SocketProvider>,
  );
}

describe('SocketProvider', () => {
  beforeEach(() => {
    sockets.length = 0;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('opens no socket until a meeting is joined', async () => {
    renderProvider();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(sockets).toHaveLength(0);
    expect(screen.getByText('Code: none')).toBeTruthy();
  });

  it('joins with only the meeting code and keeps one socket', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    await screen.findByText('connected');
    // Give a reconnect loop time to show itself
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));

    expect(sockets).toHaveLength(1);
    expect(sockets[0].connected).toBe(true);
    const joins = sockets[0].emitted.filter((e) => e.event === 'JOIN_MEETING');
    expect(joins).toEqual([{ event: 'JOIN_MEETING', data: { meetingCode: 'DEMO' } }]);
  });

  it('rejoins the remembered meeting after a reload', async () => {
    localStorage.setItem('robbie_meeting_code', JSON.stringify({ userId: 1, code: 'DEMO' }));
    renderProvider();

    await screen.findByText('connected');
    expect(screen.getByText('Code: DEMO')).toBeTruthy();
    expect(sockets).toHaveLength(1);
  });

  it("doesn't rejoin a meeting another user joined on this browser", async () => {
    // Someone else signed out; this user signed in on the same browser
    localStorage.setItem('robbie_meeting_code', JSON.stringify({ userId: 2, code: 'DEMO' }));
    renderProvider();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sockets).toHaveLength(0);
  });

  it('keeps the same socket when the server sends a state update', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await screen.findByText('connected');

    act(() => {
      sockets[0].handlers.STATE_UPDATE?.({
        state: { ...initialState, meetingCode: 'DEMO', meetingActive: true },
        stateVersion: 1,
      });
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));

    await waitFor(() => expect(sockets).toHaveLength(1));
    expect(sockets[0].connected).toBe(true);
  });

  it('leaving emits LEAVE_MEETING, disconnects and forgets the meeting', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await screen.findByText('connected');

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(sockets[0].emitted.map((e) => e.event)).toContain('LEAVE_MEETING');
    expect(sockets[0].connected).toBe(false);
    expect(screen.getByText('Code: none')).toBeTruthy();
    expect(localStorage.getItem('robbie_meeting_code')).toBeNull();
  });
});
