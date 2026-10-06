import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { useSocketConnection } from '../useSocketConnection';
import type { AuthState } from '../../types/socket';

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

const authState: AuthState = {
  email: 'chair@example.com',
  name: 'Test Chair',
  meetingCode: 'DEMO',
  token: 'test-token',
  userId: 1,
};

describe('useSocketConnection', () => {
  beforeEach(() => {
    io.mockClear();
  });

  it('keeps one socket when the onInvalidToken callback changes identity', () => {
    const { rerender } = renderHook(
      ({ onInvalidToken }) => useSocketConnection(authState, onInvalidToken),
      {
        initialProps: { onInvalidToken: () => {} },
      },
    );

    // Callers commonly pass a new function on each render
    rerender({ onInvalidToken: () => {} });
    rerender({ onInvalidToken: () => {} });

    expect(io).toHaveBeenCalledTimes(1);
  });

  it('opens a new socket when the meeting changes', () => {
    const onInvalidToken = () => {};
    const { rerender } = renderHook(({ auth }) => useSocketConnection(auth, onInvalidToken), {
      initialProps: { auth: authState },
    });

    rerender({ auth: { ...authState, meetingCode: 'OTHER1' } });

    expect(io).toHaveBeenCalledTimes(2);
  });

  describe('dispatch', () => {
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
          if (event === 'JOIN_MEETING') callback?.({ success: true, state: initialState });
          if (event === 'DISPATCH_ACTION') callback?.({ success: true });
        }),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      io.mockReturnValueOnce(socket as never);
      return handlers;
    }

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('reports no timeout for an action the server acknowledged', async () => {
      const handlers = connectedSocket();
      const { result } = renderHook(() => useSocketConnection(authState, () => {}));
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
