import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import {
  LOG_MINUTES_APPROVED,
  MOTIONS,
  logAdoptedByConsent,
  logAgendaItemCalled,
  logChairRuled,
} from '@robbie-bylawyer/shared/constants';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, Motion } from '@robbie-bylawyer/shared/types';

const socket = vi.hoisted(() => ({
  state: null as unknown as MeetingState,
  isConnected: true,
  hasJoined: true,
  joinError: null as { message: string; code: string | null } | null,
  canceled: null as string | null,
}));
vi.mock('../../context/SocketContext', () => ({
  useSocket: () => ({
    state: socket.state,
    isConnected: socket.isConnected,
    hasJoined: socket.hasJoined,
    joinError: socket.joinError,
    canceled: socket.canceled,
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
    socket.hasJoined = true;
    socket.joinError = null;
    socket.canceled = null;
  });

  it('keeps the meeting up while it reconnects after a dropped connection', () => {
    socket.state = { ...inSession, currentMotion: motion, motionStack: [motion] };
    socket.isConnected = false;
    render(<DisplayView />);
    expect(screen.getByText('Resurface the pool this spring')).toBeTruthy();
    expect(screen.getByText('Reconnecting...').getAttribute('role')).toBe('status');
    expect(screen.queryByText('Connecting to the meeting...')).toBeNull();
  });

  it('says plainly when there is no quorum, how to vote, a recess, and a second awaited', () => {
    // Six present, quorum 29
    socket.state = { ...inSession, currentMotion: motion, motionStack: [motion], votingOpen: true };
    const { unmount } = render(<DisplayView />);
    expect(screen.getByText('No quorum')).toBeTruthy();
    expect(
      screen.getByText('Vote on your phone, or raise your hand when the chair asks.'),
    ).toBeTruthy();
    unmount();
    socket.state = { ...inSession, quorum: 3, recess: { since: '8:02 PM', until: '8:15 PM' } };
    const recess = render(<DisplayView />);
    expect(screen.getByText('In recess')).toBeTruthy();
    expect(screen.getByText('Until 8:15 PM')).toBeTruthy();
    expect(screen.queryByText('No quorum')).toBeNull();
    recess.unmount();
    socket.state = { ...inSession, pendingSecond: { ...motion, secondedBy: null } };
    render(<DisplayView />);
    expect(screen.getByText('Awaiting a second').className).toContain('text-display-label');
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
    // For the owners who won't scan anything
    expect(
      screen.getByText('No phone? You still count: the chair will count you in the room.'),
    ).toBeTruthy();
  });

  it('shows the proxies and absentee ballots held apart from the people here', () => {
    socket.state = { ...inSession, proxiesHeld: 21 };
    render(<DisplayView />);
    expect(screen.getByText('6 here, 21 by proxy or absentee ballot')).toBeTruthy();
    expect(screen.getByText('Need 2 more')).toBeTruthy();
    expect(screen.queryByText(/No phone\?/)).toBeNull();
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

  it('stamps a motion adopted by unanimous consent as ADOPTED, in place of an earlier vote', () => {
    socket.state = {
      ...inSession,
      meetingLog: [
        { time: '7:41:00 PM', message: 'Chair puts the question: "Resurface the pool"' },
        { time: '7:45:00 PM', message: 'Vote: Yea 11, Nay 2. CARRIED.' },
        { time: '7:52:00 PM', message: logAdoptedByConsent() },
      ],
    };
    render(<DisplayView />);
    const word = screen.getByText('Adopted');
    expect(word.className).toContain('text-carried');
    expect(screen.getByText('By unanimous consent')).toBeTruthy();
    expect(screen.queryByText('Carried')).toBeNull();
  });

  it("says the chair's ruling, and takes the earlier vote down", () => {
    socket.state = {
      ...inSession,
      lastChairRuling: {
        ruling: 'The point is well taken.',
        motionText: 'Point of order',
        timestamp: '7:50:00 PM',
      },
      meetingLog: [
        { time: '7:45:00 PM', message: 'Vote: Yea 11, Nay 2. CARRIED.' },
        {
          time: '7:50:00 PM',
          message: logChairRuled('The point is well taken.', undefined, 'Point of order'),
        },
        // Someone joining afterward doesn't hide it
        { time: '7:51:00 PM', message: 'Frank Ruiz has joined the meeting.' },
      ],
    };
    render(<DisplayView />);
    expect(screen.getByText('The chair rules: The point is well taken.')).toBeTruthy();
    expect(screen.queryByText('Carried')).toBeNull();
  });

  it('keeps ELECTED up after the chair declares the winner, until the next question', () => {
    const declared: MeetingState = {
      ...inSession,
      electedOfficers: [
        {
          position: 'Director',
          name: 'Carmen Diaz',
          memberId: 5,
          electedAt: '8:30:00 PM',
          ballots: [{ 'Carmen Diaz': 9, 'Ray Castillo': 5 }],
          electionId: 7,
        },
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

  it('stamps ELECTED at each declaration of two directors, naming everyone elected yet', () => {
    const officer = (name: string) => ({
      position: 'Director',
      name,
      memberId: 0,
      electedAt: '8:30:00 PM',
      ballots: [{ 'Alice Brennan': 14, 'Ben Whitaker': 12, 'Carl Moss': 8 }],
      ballotTotals: [{ cast: 20 }],
      electionId: 9,
    });
    const election = {
      id: 9,
      position: 'Director',
      candidates: [
        { name: 'Ben Whitaker', id: 4 },
        { name: 'Carl Moss', id: 5 },
      ],
      requiredVotes: 'majority' as const,
      votingInProgress: false,
      seats: 1,
      ballotResults: { 'Alice Brennan': 14, 'Ben Whitaker': 12, 'Carl Moss': 8 },
      votersWhoVoted: [],
      winners: ['Ben Whitaker'],
      elected: 'Ben Whitaker',
    };
    // Alice is declared; Ben awaits his declaration
    socket.state = {
      ...inSession,
      currentElection: election,
      electedOfficers: [officer('Alice Brennan')],
      meetingLog: [
        { time: '8:30:00 PM', message: 'Chair declares Alice Brennan elected as Director.' },
      ],
    };
    const { unmount } = render(<DisplayView />);
    expect(screen.getByText('Elected')).toBeTruthy();
    expect(screen.getByText('Alice Brennan, Director')).toBeTruthy();
    expect(screen.getByText('Alice Brennan 14, Ben Whitaker 12, Carl Moss 8')).toBeTruthy();
    unmount();

    socket.state = {
      ...inSession,
      electedOfficers: [officer('Alice Brennan'), officer('Ben Whitaker')],
      meetingLog: [
        { time: '8:30:00 PM', message: 'Chair declares Alice Brennan elected as Director.' },
        { time: '8:31:00 PM', message: 'Chair declares Ben Whitaker elected as Director.' },
      ],
    };
    render(<DisplayView />);
    expect(screen.getByText('Alice Brennan and Ben Whitaker, Director')).toBeTruthy();
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

  it('says the meeting was canceled, with nothing to click', () => {
    socket.state = initialState;
    socket.isConnected = false;
    socket.hasJoined = false;
    socket.canceled = 'This meeting was canceled.';
    render(<DisplayView />);
    expect(screen.getByText('This meeting was canceled.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('puts the minutes before the room and asks for corrections', () => {
    socket.state = {
      ...inSession,
      currentAgendaItem: {
        id: 2,
        title: 'Approval of the minutes of the 2025 annual meeting',
        status: 'active',
      },
      minutesFromPreviousMeeting: '# Maple Grove HOA\n\n## Minutes of the 2025 Annual Meeting',
    };
    render(<DisplayView />);
    expect(screen.getByText('Minutes of the 2025 Annual Meeting')).toBeTruthy();
    expect(screen.getByText('Any corrections?')).toBeTruthy();
    // The agenda line says what the business is: no label repeats it
    expect(screen.getByText('Approval of the minutes of the 2025 annual meeting')).toBeTruthy();
    expect(screen.queryByText('Approval of the minutes')).toBeNull();
  });

  it('labels the minutes when no agenda line names their approval', () => {
    socket.state = {
      ...inSession,
      meetingStage: 'minutes-approval',
      currentAgendaItem: null,
      minutesFromPreviousMeeting: '## Minutes of the 2025 Annual Meeting',
    };
    render(<DisplayView />);
    expect(screen.getByText('Approval of the minutes')).toBeTruthy();
    expect(screen.getByText('Minutes of the 2025 Annual Meeting')).toBeTruthy();
  });

  it('asks for corrections in large type when the minutes are not sent to the display', () => {
    socket.state = {
      ...inSession,
      currentAgendaItem: {
        id: 2,
        title: 'Approval of the minutes of the 2025 annual meeting',
        status: 'active',
      },
      minutesFromPreviousMeeting: '',
      previousMinutesId: 'm1',
    };
    const { rerender } = render(<DisplayView />);
    // The item line names the minutes: no stand-in title under it
    expect(screen.queryByText('The minutes of the previous meeting')).toBeNull();
    expect(screen.getByText('Any corrections?').className).toContain('text-display-question');

    socket.state = {
      ...socket.state,
      minutesApproved: true,
      minutesApproval: { corrections: 'Twenty-two were present', timestamp: '' },
    };
    rerender(<DisplayView />);
    expect(screen.getByText('Approved with corrections').className).toContain(
      'text-display-question',
    );
    expect(screen.getByText('Twenty-two were present')).toBeTruthy();
  });

  it('keeps the result at an item that only gives itself minutes', () => {
    const title = "Treasurer's report (5 minutes)";
    socket.state = {
      ...inSession,
      currentAgendaItem: { id: 3, title, status: 'active' },
      minutesFromPreviousMeeting: '',
      previousMinutesId: 'm1',
      meetingLog: [
        { time: '7:30:00 PM', message: logAgendaItemCalled(title) },
        { time: '7:45:00 PM', message: 'Vote: Yea 11, Nay 2. CARRIED.' },
      ],
    };
    render(<DisplayView />);
    expect(screen.getByText('Carried')).toBeTruthy();
    expect(screen.queryByText('Any corrections?')).toBeNull();
  });

  it('stamps a decision made during the minutes, and puts the minutes over an older one', () => {
    const title = 'Approval of the minutes of the 2025 annual meeting';
    const vote = { time: '7:20:00 PM', message: 'Vote: Yea 11, Nay 2. CARRIED.' };
    const called = { time: '7:25:00 PM', message: logAgendaItemCalled(title) };
    const atTheMinutes: MeetingState = {
      ...inSession,
      currentAgendaItem: { id: 2, title, status: 'active' },
      minutesFromPreviousMeeting: '',
      previousMinutesId: 'm1',
    };
    // A vote before the item: the minutes are the business
    socket.state = { ...atTheMinutes, meetingLog: [vote, called] };
    const { rerender } = render(<DisplayView />);
    expect(screen.getByText('Any corrections?')).toBeTruthy();
    expect(screen.queryByText('Carried')).toBeNull();

    // A vote during it: its result stands until the next thing
    socket.state = { ...atTheMinutes, meetingLog: [called, vote] };
    rerender(<DisplayView />);
    expect(screen.getByText('Carried')).toBeTruthy();
    expect(screen.queryByText('Any corrections?')).toBeNull();

    // Then the minutes approved: the approval is the news
    socket.state = {
      ...atTheMinutes,
      minutesApproved: true,
      minutesApproval: { corrections: null, timestamp: '' },
      meetingLog: [called, vote, { time: '7:30:00 PM', message: LOG_MINUTES_APPROVED }],
    };
    rerender(<DisplayView />);
    expect(screen.getByText('Approved as read')).toBeTruthy();
    expect(screen.queryByText('Carried')).toBeNull();
  });
});
