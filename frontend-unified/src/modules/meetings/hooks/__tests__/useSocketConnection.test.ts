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
