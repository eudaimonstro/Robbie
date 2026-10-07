import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';

const socket = vi.hoisted(() => ({
  meetingCode: 'DEMO',
  isConnected: false,
  hasJoined: false,
  error: null as string | null,
  joinError: null as { message: string; code: string | null } | null,
  reconnect: vi.fn(),
  leaveMeeting: vi.fn(),
}));
const provider = vi.hoisted(() => ({ codes: [] as string[] }));

vi.mock('../context/SocketContext', () => ({
  SocketProvider: ({ meetingCode, children }: { meetingCode: string; children: ReactNode }) => {
    provider.codes.push(meetingCode);
    return children;
  },
  useSocket: () => socket,
}));
vi.mock('../context/OrganizationBridge', () => ({
  MeetingOrganizationProvider: ({ children }: { children: ReactNode }) => children,
  useMeetingOrganization: () => ({
    currentOrganization: null,
    availableOrganizations: [],
    loading: false,
  }),
}));
vi.mock('../views/LiveMeetingsPage', () => ({ LiveMeetingsPage: () => <p>Live meetings page</p> }));
vi.mock('../views/MeetingApp', () => ({ MeetingApp: () => <p>The meeting</p> }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => toast }));

const { default: MeetingsModule } = await import('../index');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/meetings/*" element={<MeetingsModule />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MeetingsModule routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    provider.codes = [];
    socket.isConnected = true;
    socket.error = null;
    socket.joinError = null;
  });

  it('shows the Live Meetings page at /meetings', () => {
    renderAt('/meetings');
    expect(screen.getByText('Live meetings page')).toBeTruthy();
  });

  it('opens the meeting in the link, its code in upper case', () => {
    renderAt('/meetings/maple1');
    expect(screen.getByText('The meeting')).toBeTruthy();
    expect(provider.codes).toContain('MAPLE1');
  });

  it('sends a link that cannot be a meeting code to the Live Meetings page', () => {
    renderAt('/meetings/not-a-code!');
    expect(screen.getByText('Live meetings page')).toBeTruthy();
  });
});

describe('MeetingsModule while not connected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socket.isConnected = false;
    socket.hasJoined = false;
    socket.error = null;
    socket.joinError = null;
  });

  it('keeps the meeting on screen under a banner when a joined connection drops', () => {
    socket.hasJoined = true;
    renderAt('/meetings/DEMO');

    expect(screen.getByText('The meeting')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Reconnecting...');
    expect(screen.queryByText('Connecting to meeting...')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect now' }));
    expect(socket.reconnect).toHaveBeenCalled();
  });

  it('leaves the meeting for the connecting screen when the rejoin is refused', () => {
    socket.hasJoined = true;
    socket.error = 'Too many join attempts';
    socket.joinError = { message: 'Too many join attempts', code: null };
    renderAt('/meetings/DEMO');

    expect(screen.queryByText('The meeting')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('offers a way to leave while connecting', () => {
    renderAt('/meetings/DEMO');
    fireEvent.click(screen.getByRole('button', { name: 'Leave meeting' }));
    expect(socket.leaveMeeting).toHaveBeenCalled();
  });

  it('shows why the connection failed and lets the user try again', () => {
    socket.error = 'Too many join attempts';
    socket.joinError = { message: 'Too many join attempts', code: null };
    renderAt('/meetings/DEMO');

    expect(screen.queryByText('Too many join attempts')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(socket.reconnect).toHaveBeenCalled();
  });

  it('shows the code box, with the reason, for a link to a meeting that is not scheduled', () => {
    socket.error = 'No meeting with that code';
    socket.joinError = { message: 'No meeting with that code', code: 'MEETING_NOT_FOUND' };
    renderAt('/meetings/DEMO');

    expect(screen.getByText('No meeting with that code')).toBeTruthy();
    expect((screen.getByLabelText('Meeting code') as HTMLInputElement).value).toBe('DEMO');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    // The code box says it; a toast would say it twice
    expect(toast.showToast).not.toHaveBeenCalled();
  });
});
