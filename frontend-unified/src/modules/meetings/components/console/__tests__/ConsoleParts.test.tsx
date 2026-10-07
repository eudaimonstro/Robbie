import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import type { MeetingPacket } from '../../scheduling/types';

vi.mock('../../../context/SocketContext', () => ({
  useSocket: () => ({
    isConnected: true,
    connectedMembers: [],
    currentUser: null,
    leaveMeeting: vi.fn(),
    reconnect: vi.fn(),
    error: null,
  }),
}));
vi.mock('../../QrCode', () => ({
  QrCode: ({ label }: { label: string }) => <img alt={label} />,
}));

const { ConsoleTopBar } = await import('../ConsoleTopBar');
const { JoinInfoCard } = await import('../JoinInfoCard');
const { CurrentItemLine } = await import('../CurrentItemLine');
const { ConsoleAgenda } = await import('../ConsoleAgenda');
const { ActionToolbar } = await import('../ActionToolbar');

const state: MeetingState = {
  ...initialState,
  meetingCode: 'MAPLE1',
  title: '2026 Annual Meeting',
  meetingActive: true,
  meetingStage: 'new-business',
  quorum: 29,
  headcount: 3,
  members: [{ id: 2, name: 'Dana Okafor', role: 'chair', present: true, presentBy: 'device' }],
};

const dispatch = vi.fn();

describe('the console top bar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the meeting, its stage and attendance, and opens the display in its own window', () => {
    const onJoinInfo = vi.fn();
    render(
      <ConsoleTopBar
        state={state}
        attendance={attendanceSummary(state)}
        eligible={142}
        startedAt={null}
        meetingCode="MAPLE1"
        onJoinInfo={onJoinInfo}
      />,
    );
    expect(screen.getByRole('heading', { name: '2026 Annual Meeting' })).toBeTruthy();
    expect(screen.getByText('New Business')).toBeTruthy();
    expect(screen.getByText('4 present of 142, quorum 29, not met')).toBeTruthy();
    const display = screen.getByRole('link', { name: 'Display' });
    expect(display.getAttribute('href')).toBe('/meetings/MAPLE1/display');
    expect(display.getAttribute('target')).toBe('_blank');
    fireEvent.click(screen.getByRole('button', { name: 'Join info' }));
    expect(onJoinInfo).toHaveBeenCalled();
    // The way back to the app, now that a live meeting hides the sidebar
    expect(screen.getByRole('button', { name: 'Leave meeting' }).textContent).toBe('Leave');
  });
});

describe('the join card', () => {
  it('gives the code, the link and its QR code', () => {
    render(<JoinInfoCard code="MAPLE1" />);
    const link = `${window.location.origin}/meetings/MAPLE1`;
    expect(screen.getByTestId('meeting-code').textContent).toBe('MAPLE1');
    expect(screen.getByText(link)).toBeTruthy();
    expect(screen.getByRole('img', { name: `QR code for ${link}` })).toBeTruthy();
  });

  it('folds into one line with the code, Copy the link and Show QR', () => {
    render(<JoinInfoCard code="MAPLE1" compact />);
    const link = `${window.location.origin}/meetings/MAPLE1`;
    expect(screen.getByTestId('meeting-code').textContent).toBe('MAPLE1');
    expect(screen.getByRole('button', { name: 'Copy the link' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: `QR code for ${link}` })).toBeNull();

    const show = screen.getByRole('button', { name: 'Show QR' });
    expect(show.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(show);
    expect(screen.getByRole('img', { name: `QR code for ${link}` })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide QR' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });
});

describe('the current item', () => {
  it("links the scheduled item's attachments", () => {
    const packet = {
      id: 'p1',
      organizationId: 'org-1',
      robbieCode: 'MAPLE1',
      createdAt: '',
      attachments: [],
      agendaItems: [
        {
          id: 'item-3',
          title: "Treasurer's report",
          position: 2,
          attachments: [
            {
              id: 'a1',
              type: 'uploaded_file',
              displayName: '2027 budget.pdf',
              position: 0,
              uploadedAt: '',
            },
          ],
        },
      ],
    } as MeetingPacket;
    render(
      <CurrentItemLine
        item={{ id: 3, title: "Treasurer's report", status: 'active', packetItemId: 'item-3' }}
        packet={packet}
      />,
    );
    expect(screen.getByText("Treasurer's report")).toBeTruthy();
    expect(screen.getByRole('link', { name: '2027 budget.pdf' }).getAttribute('href')).toBe(
      '/api/attachments/a1/download',
    );
  });
});

describe('the console agenda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls a pending item and completes the current one', () => {
    const agenda: MeetingState['agenda'] = [
      { id: 1, title: 'Call to order', status: 'completed' },
      { id: 2, title: "Treasurer's report", status: 'pending' },
    ];
    const { unmount } = render(
      <ConsoleAgenda state={{ ...state, agendaAdopted: true, agenda }} dispatch={dispatch} />,
    );
    fireEvent.click(screen.getByRole('button', { name: "Call Treasurer's report" }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CALL_AGENDA_ITEM', id: 2 }),
    );
    unmount();

    const current = { id: 2, title: "Treasurer's report", status: 'active' as const };
    render(
      <ConsoleAgenda
        state={{
          ...state,
          agendaAdopted: true,
          agenda: [agenda[0], current],
          currentAgendaItem: current,
        }}
        dispatch={dispatch}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "Complete Treasurer's report" }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'COMPLETE_AGENDA_ITEM', id: 2 }),
    );
  });
});

describe('the action toolbar', () => {
  it('shows each action as a button, the first as the primary one', () => {
    render(
      <ActionToolbar
        dispatch={dispatch}
        actions={[
          {
            id: 'open-vote',
            label: 'Open the vote',
            tone: 'primary',
            make: () => ({ type: 'OPEN_VOTING', voteTimerEnd: null, timestamp: '' }),
          },
          {
            id: 'consent',
            label: 'Ask for unanimous consent',
            tone: 'secondary',
            make: () => ({ type: 'REQUEST_UNANIMOUS_CONSENT', timestamp: '' }),
          },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Open the vote' }).className).toContain(
      'btn-primary',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask for unanimous consent' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'REQUEST_UNANIMOUS_CONSENT', timestamp: '' });
  });
});
