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
  canceled: null as string | null,
  reconnect: vi.fn(),
  leaveMeeting: vi.fn(),
}));
const provider = vi.hoisted(() => ({ codes: [] as string[] }));
const bridge = vi.hoisted(() => ({
  currentOrganization: null as null | { id: string; role: string },
}));

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
    currentOrganization: bridge.currentOrganization,
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
    socket.canceled = null;
  });

  it('says calmly that the meeting was canceled, with the way back to Live Meetings', () => {
    socket.hasJoined = false;
    socket.canceled = 'This meeting was canceled.';
    renderAt('/meetings/DEMO');

    expect(screen.getByRole('status').textContent).toBe('This meeting was canceled.');
    expect(screen.queryByText('The meeting')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(toast.showToast).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: 'Live Meetings' }));
    expect(screen.getByText('Live meetings page')).toBeTruthy();
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

  it("says a meeting can't open until the quorum is set, with the way to set it for an admin", () => {
    const message =
      "The meeting can't open yet: the organization's voting members and quorum aren't set. An admin sets them in Settings.";
    socket.error = message;
    socket.joinError = { message, code: 'QUORUM_NOT_SET' };
    bridge.currentOrganization = { id: 'o1', role: 'admin' };
    const { unmount } = renderAt('/meetings/DEMO');
    expect(screen.getByRole('alert').textContent).toBe(message);
    expect(screen.getByRole('link', { name: 'Set them in Settings' }).getAttribute('href')).toBe(
      '/settings#attendance',
    );
    expect(screen.getByRole('link', { name: 'Live Meetings' })).toBeTruthy();
    expect(toast.showToast).not.toHaveBeenCalled();
    unmount();

    bridge.currentOrganization = { id: 'o1', role: 'member' };
    renderAt('/meetings/DEMO');
    expect(screen.queryByRole('link', { name: 'Set them in Settings' })).toBeNull();
    bridge.currentOrganization = null;
  });
});
