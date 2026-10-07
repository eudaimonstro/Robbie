import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, Member, Motion } from '@robbie-bylawyer/shared/types';

const socket = vi.hoisted(() => ({
  state: null as unknown as MeetingState,
  currentUser: null as unknown as Member,
}));
vi.mock('../../context/SocketContext', () => ({
  useSocket: () => ({
    state: socket.state,
    dispatch: vi.fn(),
    currentUser: socket.currentUser,
    myRole: socket.currentUser.role,
    attendance: attendanceSummary(socket.state),
    meetingCode: 'MAPLE1',
    isConnected: true,
    connectedMembers: [],
    leaveMeeting: vi.fn(),
    reconnect: vi.fn(),
    error: null,
  }),
}));
vi.mock('../../context/OrganizationBridge', () => ({
  useMeetingOrganization: () => ({ availableOrganizations: [] }),
}));
vi.mock('../../hooks/useRoster', () => ({ useRoster: () => ({ roster: null, error: null }) }));
vi.mock('../../hooks/usePacket', () => ({ usePacket: () => null }));
vi.mock('../../components/console/MoreArea', () => ({ MoreArea: () => <p>More</p> }));
vi.mock('../../components/QrCode', () => ({
  QrCode: ({ label }: { label: string }) => <img alt={label} />,
}));

const { ChairConsole } = await import('../ChairConsole');

const dana: Member = {
  id: 2,
  name: 'Dana Okafor',
  role: 'chair',
  present: true,
  presentBy: 'device',
};
const admin: Member = { id: 1, name: 'Admin', role: 'admin', present: true, presentBy: 'device' };
const motion: Motion = {
  ...MOTIONS.mainMotion,
  id: 1,
  type: 'mainMotion',
  text: 'Approve the pool contract',
  mover: 'Alice Brennan',
  moverId: 3,
  secondedBy: 'Ben Whitaker',
  status: 'active',
};
const active: MeetingState = {
  ...initialState,
  meetingCode: 'MAPLE1',
  title: '2026 Annual Meeting',
  meetingActive: true,
  meetingStage: 'new-business',
  agendaAdopted: true,
  members: [dana],
};

describe('ChairConsole', () => {
  beforeEach(() => {
    socket.currentUser = dana;
  });

  it('calls the meeting to order from the question card, with the join card beside it', () => {
    socket.state = {
      ...initialState,
      meetingCode: 'MAPLE1',
      title: '2026 Annual Meeting',
      members: [dana],
    };
    render(<ChairConsole />);
    expect(screen.getByRole('button', { name: 'Call to order' })).toBeTruthy();
    expect(screen.getByTestId('meeting-code').textContent).toBe('MAPLE1');
    expect(screen.getByText('The meeting has not been called to order.')).toBeTruthy();
  });

  it('shows the question with only the actions in order', () => {
    socket.state = { ...active, currentMotion: motion, motionStack: [motion] };
    render(<ChairConsole />);
    expect(screen.getByText('Moved by Alice Brennan, seconded by Ben Whitaker')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open the vote' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Call to order' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close the vote' })).toBeNull();
  });

  it('always offers to open nominations', () => {
    socket.state = active;
    render(<ChairConsole />);
    expect(screen.getByLabelText('Open nominations for')).toBeTruthy();
  });

  it('stamps the result when a vote closes', () => {
    socket.state = {
      ...active,
      meetingLog: [
        { time: '7:41:00 PM', message: 'Chair puts the question: "Approve the pool contract"' },
        {
          time: '7:45:00 PM',
          message: 'Vote: Yea 11, Nay 2. CARRIED. On devices 2 to 0, in the room 9 to 2.',
        },
      ],
    };
    render(<ChairConsole />);
    expect(screen.getByText('Carried')).toBeTruthy();
    expect(screen.getByText('On devices 2 to 0, in the room 9 to 2: 11 to 2')).toBeTruthy();
  });

  describe('presided over by an admin, with no member in the chair', () => {
    beforeEach(() => {
      socket.currentUser = admin;
      socket.state = {
        ...active,
        members: [admin, { id: 2, name: 'Member', role: 'member', present: true }],
        inquiries: [
          {
            id: 7,
            type: 'parliamentary',
            question: 'Is a motion to recess in order?',
            askedBy: 'Member',
            askerId: 2,
            timestamp: '10:00:00',
          },
        ],
        suspendedRules: [
          {
            id: 9,
            rule: 'debate-rules',
            purpose: 'Allow a longer report',
            specificAction: 'Treasurer speaks for 10 minutes',
            scope: 'meeting-remainder',
            suspendedAt: '10:00:00',
            motionId: 5,
          },
        ],
      };
    });

    it('lets the admin answer inquiries', () => {
      render(<ChairConsole />);
      expect(screen.queryByText(/Is a motion to recess in order\?/)).not.toBeNull();
      expect(screen.queryByPlaceholderText('Enter your answer...')).not.toBeNull();
    });

    it('lets the admin restore a suspended rule', () => {
      render(<ChairConsole />);
      expect(screen.queryByRole('button', { name: /restore/i })).not.toBeNull();
    });
  });
});
