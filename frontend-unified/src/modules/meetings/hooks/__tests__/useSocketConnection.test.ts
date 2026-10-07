import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { useSocketConnection } from '../useSocketConnection';

const io = vi.hoisted(() =>
  vi.fn(() => ({
    connected: false,
    on: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
);

vi.mock('socket.io-client', () => ({ io }));

type Handler = (...args: unknown[]) => void;

// A socket that joins on connect and acknowledges each action at once
function connectedSocket() {
  const handlers: Record<string, Handler> = {};
  const socket = {
    connected: true,
    on: vi.fn((event: string, handler: Handler) => {
      handlers[event] = handler;
    }),
    emit: vi.fn((event: string, _data: unknown, callback?: Handler) => {
      if (event === 'JOIN_MEETING') {
        callback?.({ success: true, state: initialState, stateVersion: 1 });
      }
      if (event === 'DISPATCH_ACTION') callback?.({ success: true });
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  io.mockReturnValueOnce(socket as never);
  return { handlers, socket };
}

describe('useSocketConnection', () => {
  beforeEach(() => {
    io.mockClear();
  });

  it('opens no socket without a meeting code', () => {
    renderHook(() => useSocketConnection(null, () => {}));

    expect(io).not.toHaveBeenCalled();
  });

  it('keeps one socket when the onNotSignedIn callback changes identity', () => {
    const { rerender } = renderHook(
      ({ onNotSignedIn }) => useSocketConnection('DEMO', onNotSignedIn),
      {
        initialProps: { onNotSignedIn: () => {} },
      },
    );

    // Callers commonly pass a new function on each render
    rerender({ onNotSignedIn: () => {} });
    rerender({ onNotSignedIn: () => {} });

    expect(io).toHaveBeenCalledTimes(1);
  });

  it('opens a new socket when the meeting changes', () => {
    const onNotSignedIn = () => {};
    const { rerender } = renderHook(({ code }) => useSocketConnection(code, onNotSignedIn), {
      initialProps: { code: 'DEMO' },
    });

    rerender({ code: 'OTHER1' });

    expect(io).toHaveBeenCalledTimes(2);
  });

  it('connects to the page origin when no server URL is configured', () => {
    renderHook(() => useSocketConnection('DEMO', () => {}));

    expect(io).toHaveBeenCalledWith(expect.objectContaining({ withCredentials: true }));
  });

  it('shows an error when the server ends the connection', () => {
    const { handlers } = connectedSocket();
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());

    act(() => handlers.disconnect('io server disconnect'));

    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBe('Disconnected by the server.');
  });

  it('shows no error for a dropped connection that reconnects by itself', () => {
    const { handlers } = connectedSocket();
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());

    act(() => handlers.disconnect('transport close'));

    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('never stops trying to reconnect', () => {
    renderHook(() => useSocketConnection('DEMO', () => {}));
    renderHook(() => useSocketConnection('DEMO', () => {}, undefined, { display: true }));

    for (const [options] of io.mock.calls as unknown as [Record<string, unknown>][]) {
      expect(options).toMatchObject({ reconnection: true, reconnectionAttempts: Infinity });
    }
  });

  it('connects at once when the device is back online or the page is shown again', () => {
    const { handlers, socket } = connectedSocket();
    renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());

    // Still connected: nothing to do
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(socket.connect).not.toHaveBeenCalled();

    socket.connected = false;
    act(() => handlers.disconnect('transport close'));
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(socket.connect).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(socket.connect).toHaveBeenCalledTimes(2);
  });

  it('stops listening for the network once the meeting is left', () => {
    const { handlers, socket } = connectedSocket();
    const { unmount } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());
    socket.connected = false;
    unmount();

    window.dispatchEvent(new Event('online'));
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('remembers the meeting was joined through a dropped connection, until it is left', () => {
    const { handlers } = connectedSocket();
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    expect(result.current.hasJoined).toBe(false);
    act(() => handlers.connect());
    expect(result.current.hasJoined).toBe(true);

    act(() => handlers.disconnect('transport close'));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.hasJoined).toBe(true);

    act(() => result.current.disconnect());
    expect(result.current.hasJoined).toBe(false);
  });

  it('joins with only the meeting code', () => {
    const { handlers, socket } = connectedSocket();
    renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());

    const join = socket.emit.mock.calls.find(([event]) => event === 'JOIN_MEETING');
    expect(join?.[1]).toEqual({ meetingCode: 'DEMO' });
  });

  it('reports a lost session when the connection is refused as not signed in', () => {
    const { handlers } = connectedSocket();
    const onNotSignedIn = vi.fn();
    const { result } = renderHook(() => useSocketConnection('DEMO', onNotSignedIn));

    act(() => handlers.connect_error(new Error('Not signed in')));

    expect(onNotSignedIn).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('shows other connection errors without reporting a lost session', () => {
    const { handlers } = connectedSocket();
    const onNotSignedIn = vi.fn();
    const { result } = renderHook(() => useSocketConnection('DEMO', onNotSignedIn));

    act(() => handlers.connect_error(new Error('xhr poll error')));

    expect(onNotSignedIn).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Connection error: xhr poll error');
  });

  it('reports a connection refused for the terms, without an error or a lost session', () => {
    const { handlers } = connectedSocket();
    const onNotSignedIn = vi.fn();
    const onTermsNotAccepted = vi.fn();
    const { result } = renderHook(() =>
      useSocketConnection('DEMO', onNotSignedIn, onTermsNotAccepted),
    );

    act(() =>
      handlers.connect_error(
        Object.assign(new Error('Accept the terms to continue'), {
          data: { code: 'TERMS_NOT_ACCEPTED' },
        }),
      ),
    );

    expect(onTermsNotAccepted).toHaveBeenCalledTimes(1);
    expect(onNotSignedIn).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  describe('dispatch', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('keeps the newest state when updates arrive out of order', () => {
      const { handlers } = connectedSocket();
      const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
      act(() => handlers.connect());

      const update = (stateVersion: number, quorum: number) => ({
        state: { ...initialState, quorum },
        stateVersion,
      });
      act(() => handlers.STATE_UPDATE(update(5, 5)));
      act(() => handlers.STATE_UPDATE(update(4, 4)));

      expect(result.current.state.quorum).toBe(5);
    });

    it('reports no timeout for an action the server acknowledged', async () => {
      const { handlers } = connectedSocket();
      const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
      act(() => handlers.connect());

      let succeeded: boolean | undefined;
      await act(async () => {
        succeeded = await result.current.dispatch({ type: 'START_MEETING', timestamp: '' });
      });
      act(() => vi.advanceTimersByTime(10_000));

      expect(succeeded).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });
});

describe('useSocketConnection joins', () => {
  beforeEach(() => {
    io.mockClear();
  });

  // A socket that answers JOIN_MEETING with the given response
  function socketAnswering(response: Record<string, unknown>) {
    const handlers: Record<string, Handler> = {};
    const socket = {
      connected: true,
      on: vi.fn((event: string, handler: Handler) => {
        handlers[event] = handler;
      }),
      emit: vi.fn((event: string, _data: unknown, callback?: Handler) => {
        if (event === 'JOIN_MEETING') callback?.(response);
      }),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    io.mockReturnValueOnce(socket as never);
    return { handlers, socket };
  }

  const joined = { success: true, state: initialState, stateVersion: 1 };

  it('joins with the code alone, as the mobile app does', () => {
    const { handlers, socket } = socketAnswering(joined);
    renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());
    expect(socket.emit).toHaveBeenCalledWith(
      'JOIN_MEETING',
      { meetingCode: 'DEMO' },
      expect.any(Function),
    );
  });

  it('joins a display without making it a member', () => {
    const { handlers, socket } = socketAnswering(joined);
    renderHook(() => useSocketConnection('DEMO', () => {}, undefined, { display: true }));
    act(() => handlers.connect());
    expect(socket.emit).toHaveBeenCalledWith(
      'JOIN_MEETING',
      { meetingCode: 'DEMO', display: true },
      expect.any(Function),
    );
  });

  it('says why a join was refused, with the code the server sent', () => {
    const { handlers } = socketAnswering({
      success: false,
      error: 'No meeting with that code',
      errorCode: 'MEETING_NOT_FOUND',
    });
    const { result } = renderHook(() => useSocketConnection('NOPE01', () => {}));
    act(() => handlers.connect());
    expect(result.current.isConnected).toBe(false);
    expect(result.current.joinError).toEqual({
      message: 'No meeting with that code',
      code: 'MEETING_NOT_FOUND',
    });
  });

  it('forgets the refusal when trying again', () => {
    const { handlers, socket } = socketAnswering({
      success: false,
      error: 'Too many join attempts',
    });
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());
    expect(result.current.joinError).toEqual({ message: 'Too many join attempts', code: null });

    act(() => result.current.reconnect());
    expect(result.current.joinError).toBeNull();
    expect(socket.connect).toHaveBeenCalled();
  });
});
