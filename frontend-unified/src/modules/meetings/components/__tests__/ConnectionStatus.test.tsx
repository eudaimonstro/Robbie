import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const socket = vi.hoisted(() => ({
  isConnected: false,
  error: null as string | null,
  reconnect: vi.fn(),
  leaveMeeting: vi.fn(),
}));
vi.mock('../../context/SocketContext', () => ({ useSocket: () => socket }));

const { ConnectionStatus } = await import('../ConnectionStatus');

describe('ConnectionStatus', () => {
  it('says the connection is lost, with a named Reconnect button', () => {
    render(<ConnectionStatus />);
    expect(screen.getByText('Disconnected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(socket.reconnect).toHaveBeenCalled();
  });
});
