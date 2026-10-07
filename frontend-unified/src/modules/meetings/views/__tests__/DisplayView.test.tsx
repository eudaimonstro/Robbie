import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, Motion } from '@robbie-bylawyer/shared/types';

const socket = vi.hoisted(() => ({
  state: null as unknown as MeetingState,
  isConnected: true,
  joinError: null as { message: string; code: string | null } | null,
}));
vi.mock('../../context/SocketContext', () => ({
  useSocket: () => ({
    state: socket.state,
    isConnected: socket.isConnected,
    joinError: socket.joinError,
    meetingCode: 'MAPLE1',
    attendance: attendanceSummary(socket.state),
  }),
}));
vi.mock('../../context/OrganizationBridge', () => ({
  useMeetingOrganization: () => ({
    availableOrganizations: [{ id: 'org-1', name: 'Maple Grove HOA', eligibleVoters: 142 }],
  }),
}));
vi.mock('../../hooks/useRoster', () => ({ useRoster: () => ({ roster: null, error: null }) }));
vi.mock('../../components/QrCode', () => ({
  QrCode: ({ label, size }: { label: string; size: number }) => <img alt={label} width={size} />,
}));

const { DisplayView } = await import('../DisplayView');

const motion: Motion = {
  ...MOTIONS.mainMotion,
  id: 1,
  type: 'mainMotion',
  text: 'Resurface the pool this spring',
  mover: 'Alice Brennan',
  moverId: 3,
  secondedBy: 'Ben Whitaker',
  status: 'active',
};

const scheduled: MeetingState = {
  ...initialState,
  meetingCode: 'MAPLE1',
  organizationId: 'org-1',
  title: '2026 Annual Meeting',
  quorum: 29,
  headcount: 3,
  members: [
    { id: 2, name: 'Dana Okafor', role: 'chair', present: true, presentBy: 'device' },
    { id: 3, name: 'Alice Brennan', role: 'member', present: true, presentBy: 'device' },
    { id: 4, name: 'Ben Whitaker', role: 'member', present: true, presentBy: 'device' },
  ],
};
const inSession: MeetingState = {
  ...scheduled,
  meetingActive: true,
  meetingStage: 'unfinished-business',
  agendaAdopted: true,
  currentAgendaItem: { id: 4, title: 'Old business: pool resurfacing contract', status: 'active' },
};

describe('DisplayView', () => {
  beforeEach(() => {
    socket.isConnected = true;
    socket.joinError = null;
  });

  it('shows where to join before the meeting: the link, the code, the QR code and attendance', () => {
    socket.state = scheduled;
    render(<DisplayView />);
    expect(screen.getByText('Maple Grove HOA')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '2026 Annual Meeting' })).toBeTruthy();
    expect(screen.getByText('Join at')).toBeTruthy();
    expect(screen.getByText(`${window.location.origin}/meetings/MAPLE1`)).toBeTruthy();
    expect(screen.getByText('MAPLE1')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Scan to join' }).getAttribute('width')).toBe('360');
    // Three on devices and three counted in the room, of 142; 29 needed
    expect(screen.getByText('Need 23 more')).toBeTruthy();
  });

  it('says when the meeting starts, under the title', () => {
    socket.state = { ...scheduled, scheduledFor: '2026-10-21T00:00:00.000Z' };
    render(<DisplayView />);
    expect(screen.getByText('Tuesday, October 20, 7:00 PM')).toBeTruthy();
  });

  it('is always in the evening palette', () => {
    socket.state = scheduled;
    const { container } = render(<DisplayView />);
    expect((container.firstChild as HTMLElement).className.split(' ')).toContain('dark');
  });

  it('shows the item, the question and the vote in progress, with the count in the room', () => {
    socket.state = {
      ...inSession,
      currentMotion: motion,
      motionStack: [motion],
      votingOpen: true,
      voters: [3, 4],
      votes: { yea: 2, nay: 0, abstain: 0 },
      floorVotes: { yea: 9, nay: 2, abstain: 0 },
    };
    render(<DisplayView />);
    expect(screen.getByText('Old business: pool resurfacing contract')).toBeTruthy();
    expect(screen.getByText('Resurface the pool this spring').className).toContain(
      'text-display-question',
    );
    expect(screen.getByText('Moved by Alice Brennan, seconded by Ben Whitaker')).toBeTruthy();
    expect(screen.getByText(/votes received/).textContent).toBe('2 votes received');
    expect(screen.getByText('In the room: 9 to 2')).toBeTruthy();
  });

  it("keeps a secret ballot's counts off the screen", () => {
    socket.state = {
      ...inSession,
      currentMotion: motion,
      motionStack: [motion],
      votingOpen: true,
      votingMethod: 'ballot',
      voters: [3, 4],
      floorVotes: { yea: 9, nay: 2, abstain: 0 },
    };
    render(<DisplayView />);
    expect(screen.getByText(/votes received/).textContent).toBe('2 votes received');
    expect(screen.queryByText('In the room: 9 to 2')).toBeNull();
  });

  it('shows who has the floor, the time left and who is waiting', () => {
    socket.state = {
      ...inSession,
      currentMotion: motion,
      motionStack: [motion],
      recognizedSpeaker: { id: 3, name: 'Alice Brennan', role: 'member', present: true },
      speakerTimerEnd: Date.now() + 60_000,
      speakerQueue: [
        { member: { id: 4, name: 'Ben Whitaker', role: 'member', present: true }, stance: 'con' },
      ],
    };
    render(<DisplayView />);
    const rail = screen.getByRole('complementary', { name: 'Speakers' });
    expect(rail.textContent).toContain('Alice Brennan');
    expect(rail.textContent).toContain('Ben Whitaker');
    expect(rail.textContent).toContain('Against');
    expect(screen.getByRole('timer')).toBeTruthy();
  });

  it('stamps the result, in both parts, until the next question', () => {
    socket.state = {
      ...inSession,
      meetingLog: [
        {
          time: '7:41:00 PM',
          message: 'Chair puts the question: "Resurface the pool this spring"',
        },
        {
          time: '7:45:00 PM',
          message: 'Vote: Yea 11, Nay 2. CARRIED. On devices 2 to 0, in the room 9 to 2.',
        },
      ],
    };
    render(<DisplayView />);
    expect(screen.getByText('Carried')).toBeTruthy();
    expect(screen.getByText('On devices 2 to 0, in the room 9 to 2: 11 to 2')).toBeTruthy();
  });

  it('keeps ELECTED up after the chair declares the winner, until the next question', () => {
    const declared: MeetingState = {
      ...inSession,
      electedOfficers: [
        { position: 'Director', name: 'Carmen Diaz', memberId: 5, electedAt: '8:30:00 PM' },
      ],
      meetingLog: [
        {
          time: '8:28:00 PM',
          message:
            'Voting closed for Director. Results: Carmen Diaz: 9 vote(s), Ray Castillo: 5 vote(s). Carmen Diaz elected.',
        },
        { time: '8:30:00 PM', message: 'Chair declares Carmen Diaz elected as Director.' },
      ],
    };
    socket.state = declared;
    const { unmount } = render(<DisplayView />);
    expect(screen.getByText('Elected')).toBeTruthy();
    expect(screen.getByText('Carmen Diaz, Director')).toBeTruthy();
    expect(screen.getByText('Carmen Diaz 9, Ray Castillo 5')).toBeTruthy();
    unmount();

    socket.state = { ...declared, pendingSecond: { ...motion, secondedBy: null } };
    render(<DisplayView />);
    expect(screen.queryByText('Elected')).toBeNull();
    expect(screen.getByText('Resurface the pool this spring')).toBeTruthy();
  });

  it('says when the meeting adjourned, how much it decided, and where the minutes will be', () => {
    socket.state = {
      ...scheduled,
      meetingStage: 'adjourned',
      meetingLog: [{ time: '8:42:15 PM', message: 'Meeting adjourned.' }],
      completedMotions: [
        {
          id: 1,
          type: 'mainMotion',
          name: 'Main Motion',
          text: 'Resurface the pool',
          passed: true,
          voterChoices: {},
          timestamp: '7:45:00 PM',
          reconsidered: false,
        },
      ],
    };
    render(<DisplayView />);
    expect(screen.getByText('Adjourned at 8:42 PM')).toBeTruthy();
    expect(screen.getByText('1 item decided')).toBeTruthy();
    expect(screen.getByText(/minutes/)).toBeTruthy();
  });

  it('says why it could not join', () => {
    socket.state = initialState;
    socket.isConnected = false;
    socket.joinError = {
      message: "Only the organization's members can open the display",
      code: 'PERMISSION_DENIED',
    };
    render(<DisplayView />);
    expect(screen.getByText("Only the organization's members can open the display")).toBeTruthy();
  });
});
