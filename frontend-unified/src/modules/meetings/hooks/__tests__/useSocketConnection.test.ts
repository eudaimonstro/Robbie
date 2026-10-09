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

  it('leaves a canceled meeting for good, saying so', () => {
    const { handlers, socket } = connectedSocket();
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());

    act(() => handlers.ERROR({ message: 'This meeting was canceled.', code: 'MEETING_CANCELED' }));
    expect(result.current.canceled).toBe('This meeting was canceled.');
    expect(result.current.isConnected).toBe(false);
    expect(result.current.hasJoined).toBe(false);
    expect(result.current.error).toBeNull();
    expect(socket.disconnect).toHaveBeenCalled();

    // Nothing brings it back: there is no meeting to rejoin
    socket.connected = false;
    act(() => handlers.disconnect('io client disconnect'));
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('shows any other error the server sends', () => {
    const { handlers } = connectedSocket();
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());
    act(() => handlers.ERROR({ message: 'Something went wrong', code: 'INTERNAL' }));
    expect(result.current.error).toBe('Something went wrong');
    expect(result.current.canceled).toBeNull();
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

  it('joins with the code alone', () => {
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

describe('useSocketConnection updates and reconnects', () => {
  beforeEach(() => {
    io.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const line = (message: string) => ({ time: '7:00 PM', message });
  const base = { ...initialState, meetingLog: [line('Meeting called to order.')] };

  // A socket whose answers each test gives: joins in turn, and the whole state on request
  function scriptedSocket(joins: Array<Record<string, unknown>>, whole?: Record<string, unknown>) {
    const handlers: Record<string, Handler> = {};
    const socket = {
      connected: true,
      io: { engine: { close: vi.fn() } },
      on: vi.fn((event: string, handler: Handler) => {
        handlers[event] = handler;
      }),
      emit: vi.fn((event: string, data?: unknown, callback?: Handler) => {
        if (event === 'JOIN_MEETING') callback?.(joins.shift());
        if (event === 'REQUEST_STATE') (data as Handler)?.(whole);
      }),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    io.mockReturnValueOnce(socket as never);
    return { handlers, socket };
  }

  it('builds the whole state from updates that carry only the history added', () => {
    const { handlers } = scriptedSocket([{ success: true, state: base, stateVersion: 3 }]);
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());

    act(() =>
      handlers.STATE_UPDATE({
        state: { ...base, quorum: 7, meetingLog: [line('Vote: Yea 9, Nay 2. CARRIED.')] },
        stateVersion: 5,
        baseVersion: 3,
        tails: { meetingLog: 1 },
      }),
    );

    expect(result.current.state.quorum).toBe(7);
    expect(result.current.state.meetingLog.map((l) => l.message)).toEqual([
      'Meeting called to order.',
      'Vote: Yea 9, Nay 2. CARRIED.',
    ]);
  });

  it('keeps the previous minutes it has when an update leaves them out', () => {
    const withMinutes = { ...base, minutesFromPreviousMeeting: '# Minutes' };
    const { handlers } = scriptedSocket([{ success: true, state: withMinutes, stateVersion: 3 }]);
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());

    act(() =>
      handlers.STATE_UPDATE({
        state: { ...withMinutes, minutesFromPreviousMeeting: '', quorum: 4 },
        stateVersion: 4,
        baseVersion: 3,
        unchanged: ['minutesFromPreviousMeeting'],
      }),
    );

    expect(result.current.state.minutesFromPreviousMeeting).toBe('# Minutes');
    expect(result.current.state.quorum).toBe(4);
  });

  it('asks for the whole state when an update builds on one it never had', () => {
    const whole = { ...base, quorum: 9, meetingLog: [line('a'), line('b'), line('c')] };
    const { handlers, socket } = scriptedSocket([{ success: true, state: base, stateVersion: 3 }], {
      success: true,
      state: whole,
      stateVersion: 8,
    });
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());

    act(() =>
      handlers.STATE_UPDATE({
        state: { ...base, meetingLog: [line('c')] },
        stateVersion: 8,
        baseVersion: 6,
        tails: { meetingLog: 2 },
      }),
    );

    expect(socket.emit).toHaveBeenCalledWith('REQUEST_STATE', expect.any(Function));
    expect(result.current.state).toEqual(whole);
  });

  it('asks for the state after joining when the room moved on while the join was answered', () => {
    const handlers: Record<string, Handler> = {};
    let answerJoin: Handler = () => {};
    const socket = {
      connected: true,
      on: vi.fn((event: string, handler: Handler) => {
        handlers[event] = handler;
      }),
      emit: vi.fn((event: string, data?: unknown, callback?: Handler) => {
        if (event === 'JOIN_MEETING') answerJoin = callback!;
        if (event === 'REQUEST_STATE') {
          (data as Handler)({ success: true, state: { ...base, quorum: 6 }, stateVersion: 6 });
        }
      }),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    io.mockReturnValueOnce(socket as never);
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());

    // An update for the room arrives before the join's answer, which is older
    act(() => handlers.STATE_UPDATE({ state: base, stateVersion: 6 }));
    act(() => answerJoin({ success: true, state: base, stateVersion: 4 }));

    expect(socket.emit).toHaveBeenCalledWith('REQUEST_STATE', expect.any(Function));
    expect(result.current.state.quorum).toBe(6);
  });

  it('says it is still trying, with what the server said, after a few refused tries', () => {
    const refused = {
      success: false,
      error: "Couldn't join the meeting. Try again.",
      retryAfterMs: 3000,
    };
    const { handlers } = scriptedSocket([refused, refused, refused, refused]);
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());
    expect(result.current.error).toBeNull();
    act(() => vi.advanceTimersByTime(3000));
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.error).toBe(
      "Still trying to join... Couldn't join the meeting. Try again.",
    );
    expect(result.current.joinError).toBeNull();
  });

  it('asks for the whole state again when a request goes unanswered', () => {
    const handlers: Record<string, Handler> = {};
    const socket = {
      connected: true,
      on: vi.fn((event: string, handler: Handler) => {
        handlers[event] = handler;
      }),
      emit: vi.fn((event: string, _data?: unknown, callback?: Handler) => {
        if (event === 'JOIN_MEETING') callback?.({ success: true, state: base, stateVersion: 3 });
        // REQUEST_STATE is never answered
      }),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    io.mockReturnValueOnce(socket as never);
    renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());
    const gap = { state: base, stateVersion: 9, baseVersion: 7, tails: { meetingLog: 1 } };
    const requests = () => socket.emit.mock.calls.filter(([event]) => event === 'REQUEST_STATE');

    act(() => handlers.STATE_UPDATE(gap));
    act(() => handlers.STATE_UPDATE({ ...gap, stateVersion: 10 }));
    expect(requests()).toHaveLength(1);

    act(() => vi.advanceTimersByTime(5000));
    act(() => handlers.STATE_UPDATE({ ...gap, stateVersion: 11 }));
    expect(requests()).toHaveLength(2);
  });

  it('tries a join refused for now again, keeping the meeting on screen', () => {
    const { handlers, socket } = scriptedSocket([
      { success: true, state: base, stateVersion: 3 },
      {
        success: false,
        error: 'Too many join attempts. Please wait 5 seconds.',
        errorCode: 'RATE_LIMITED',
        retryAfterMs: 5000,
      },
      { success: true, state: base, stateVersion: 3 },
    ]);
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());
    act(() => handlers.disconnect('transport close'));
    act(() => handlers.connect());

    // Refused: no refusal on screen, the meeting still joined, a second try waiting
    expect(result.current.joinError).toBeNull();
    expect(result.current.hasJoined).toBe(true);
    expect(result.current.isConnected).toBe(false);
    const joins = () => socket.emit.mock.calls.filter(([event]) => event === 'JOIN_MEETING');
    expect(joins()).toHaveLength(2);

    act(() => vi.advanceTimersByTime(4999));
    expect(joins()).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(joins()).toHaveLength(3);
    expect(result.current.isConnected).toBe(true);
  });

  it('shows the connection lost as soon as the device goes offline, and back when online', () => {
    const { handlers } = scriptedSocket([{ success: true, state: base, stateVersion: 3 }]);
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());
    expect(result.current.isConnected).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.hasJoined).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.isConnected).toBe(true);
  });

  it('refuses to send an action while offline, at once', async () => {
    const { handlers, socket } = scriptedSocket([{ success: true, state: base, stateVersion: 3 }]);
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    let sent: boolean | undefined;
    await act(async () => {
      sent = await result.current.dispatch({ type: 'CAST_VOTE', vote: 'yea', voterId: 1 });
    });

    expect(sent).toBe(false);
    expect(result.current.error).toBe('You are offline. Nothing was sent.');
    const actions = socket.emit.mock.calls.filter(([event]) => event === 'DISPATCH_ACTION');
    expect(actions).toEqual([]);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
  });

  it('connects afresh when shown again after long enough hidden to have lost the connection', () => {
    const { handlers, socket } = scriptedSocket([{ success: true, state: base, stateVersion: 3 }]);
    renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());

    const show = (visibility: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', {
        value: visibility,
        configurable: true,
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };
    show('hidden');
    act(() => vi.advanceTimersByTime(5_000));
    show('visible');
    expect(socket.io.engine.close).not.toHaveBeenCalled();

    show('hidden');
    act(() => vi.advanceTimersByTime(25_000));
    show('visible');
    expect(socket.io.engine.close).toHaveBeenCalledTimes(1);
  });
});
