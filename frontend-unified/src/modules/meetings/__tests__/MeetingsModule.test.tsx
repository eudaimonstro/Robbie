import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const socket = vi.hoisted(() => ({
  meetingCode: 'DEMO' as string | null,
  isConnected: false,
  error: null as string | null,
  reconnect: vi.fn(),
  joinMeeting: vi.fn(),
  leaveMeeting: vi.fn(),
}));

vi.mock('../context/SocketContext', () => ({
  SocketProvider: ({ children }: { children: ReactNode }) => children,
  useSocket: () => socket,
}));
vi.mock('../context/OrganizationBridge', () => ({
  MeetingOrganizationProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../components/scheduling', () => ({ MeetingScheduler: () => <p>Scheduler</p> }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast: () => {} }) }));

const { default: MeetingsModule } = await import('../index');

describe('MeetingsModule without a meeting', () => {
  beforeEach(() => {
    socket.meetingCode = null;
    socket.error = null;
  });

  it('shows the join screen', () => {
    render(<MeetingsModule />);
    expect(screen.getByLabelText('Meeting code')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join meeting' })).toBeTruthy();
  });
});

describe('MeetingsModule while not connected', () => {
  beforeEach(() => {
    socket.meetingCode = 'DEMO';
    socket.error = null;
    socket.reconnect.mockClear();
    socket.leaveMeeting.mockClear();
  });

  it('offers a way to leave while connecting', () => {
    render(<MeetingsModule />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave meeting' }));
    expect(socket.leaveMeeting).toHaveBeenCalled();
  });

  it('shows why the connection failed and lets the user try again', () => {
    socket.error = 'Too many join attempts';
    render(<MeetingsModule />);

    expect(screen.queryByText('Too many join attempts')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(socket.reconnect).toHaveBeenCalled();
  });
});
