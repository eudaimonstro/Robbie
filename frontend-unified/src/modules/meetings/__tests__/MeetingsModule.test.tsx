import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const socket = vi.hoisted(() => ({
  isAuthenticated: true,
  isConnected: false,
  error: null as string | null,
  reconnect: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../context/SocketContext', () => ({
  SocketProvider: ({ children }: { children: ReactNode }) => children,
  useSocket: () => socket,
}));
vi.mock('../context/OrganizationBridge', () => ({
  MeetingOrganizationProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast: () => {} }) }));

const { default: MeetingsModule } = await import('../index');

describe('MeetingsModule while not connected', () => {
  beforeEach(() => {
    socket.error = null;
    socket.reconnect.mockClear();
    socket.logout.mockClear();
  });

  it('offers a way to leave while connecting', () => {
    render(<MeetingsModule />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave meeting' }));
    expect(socket.logout).toHaveBeenCalled();
  });

  it('shows why the connection failed and lets the user try again', () => {
    socket.error = 'Too many join attempts';
    render(<MeetingsModule />);

    expect(screen.queryByText('Too many join attempts')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(socket.reconnect).toHaveBeenCalled();
  });
});
