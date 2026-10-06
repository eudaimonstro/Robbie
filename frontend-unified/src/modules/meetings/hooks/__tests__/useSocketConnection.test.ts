import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
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
});
