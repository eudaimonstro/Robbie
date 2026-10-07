import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, Member, Motion } from '@robbie-bylawyer/shared/types';

const socket = vi.hoisted(() => ({
  state: null as unknown as MeetingState,
  currentUser: null as unknown as Member,
  dispatch: vi.fn(),
  error: null as string | null,
}));
vi.mock('../../context/SocketContext', () => ({
  useSocket: () => ({
    state: socket.state,
    dispatch: socket.dispatch,
    currentUser: socket.currentUser,
    myRole: socket.currentUser.role,
    attendance: attendanceSummary(socket.state),
    meetingCode: 'MAPLE1',
    isConnected: true,
    connectedMembers: [],
    leaveMeeting: vi.fn(),
    reconnect: vi.fn(),
    error: socket.error,
  }),
}));
vi.mock('../../context/OrganizationBridge', () => ({
  useMeetingOrganization: () => ({ availableOrganizations: [] }),
}));
vi.mock('../../hooks/useRoster', () => ({ useRoster: () => ({ roster: null, error: null }) }));
vi.mock('../../hooks/usePacket', () => ({ usePacket: () => null }));
vi.mock('../../components/console/MoreArea', () => ({ MoreArea: () => <p>More</p> }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
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

const carmen: Member = {
  id: 5,
  name: 'Carmen Diaz',
  role: 'member',
  present: true,
  presentBy: 'chair',
};
const alice: Member = {
  id: 3,
  name: 'Alice Brennan',
  role: 'member',
  present: true,
  presentBy: 'device',
};

describe('ChairConsole', () => {
  beforeEach(() => {
    socket.currentUser = dana;
    socket.dispatch.mockReset();
    // The server applies each action, unless a test says otherwise
    socket.dispatch.mockResolvedValue(true);
    socket.error = null;
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

  describe('adjourning', () => {
    const agenda: MeetingState['agenda'] = [
      { id: 1, title: 'Call to order', status: 'completed' },
      { id: 2, title: "Treasurer's report", status: 'completed' },
      { id: 3, title: 'Pool contract', status: 'pending' },
      { id: 4, title: 'Landscaping', status: 'pending' },
      { id: 5, title: 'Adjournment', status: 'pending' },
    ];

    it('asks first, naming the items not reached', () => {
      socket.state = { ...active, agenda };
      render(<ChairConsole />);
      fireEvent.click(screen.getByRole('button', { name: 'Adjourn' }));
      expect(socket.dispatch).not.toHaveBeenCalled();
      const dialog = screen.getByRole('dialog', { name: 'Adjourn the meeting?' });
      expect(within(dialog).getByText('3. Pool contract')).toBeTruthy();
      expect(within(dialog).getByText('4. Landscaping')).toBeTruthy();
      // Adjourning completes the Adjournment item: it isn't an item not reached
      expect(within(dialog).queryByText('5. Adjournment')).toBeNull();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Keep going' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(socket.dispatch).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Adjourn' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Adjourn' }));
      expect(socket.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'END_MEETING' }),
      );
    });

    it('leaves a record with nothing to change once adjourned', () => {
      socket.state = {
        ...active,
        meetingActive: false,
        meetingStage: 'adjourned',
        agenda,
        meetingLog: [{ time: '8:42:15 PM', message: 'Meeting adjourned.' }],
      };
      render(<ChairConsole />);
      expect(screen.getByText('Adjourned at 8:42 PM')).toBeTruthy();
      expect(screen.queryByRole('toolbar')).toBeNull();
      expect(screen.queryByLabelText('Headcount')).toBeNull();
      expect(screen.queryByRole('button', { name: /^Call / })).toBeNull();
      expect(screen.queryByLabelText('Open nominations for')).toBeNull();
      expect(screen.queryByTestId('meeting-code')).toBeNull();
      expect(screen.queryByRole('region', { name: 'The result' })).toBeNull();
    });

    it('shows nothing live once adjourned, even with an election and a motion left in the state', () => {
      socket.state = {
        ...active,
        meetingActive: false,
        meetingStage: 'adjourned',
        currentMotion: motion,
        currentElection: {
          id: 7,
          position: 'Director',
          candidates: [{ name: 'Carmen Diaz', id: 5 }],
          requiredVotes: 'majority',
          votingInProgress: true,
          ballotResults: {},
          votersWhoVoted: [],
          elected: null,
        },
        electedOfficers: [
          { position: 'Treasurer', name: 'Ray Castillo', memberId: 6, electedAt: '8:10:00 PM' },
        ],
        meetingLog: [{ time: '8:42:15 PM', message: 'Meeting adjourned.' }],
      };
      render(<ChairConsole />);
      expect(screen.getByText('Adjourned at 8:42 PM')).toBeTruthy();
      expect(screen.queryByText('Approve the pool contract')).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Election for Director' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Close the ballot' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Set the election aside' })).toBeNull();
      expect(screen.queryByText('How the vote is taken')).toBeNull();
      // Who was elected stays, as the record
      expect(screen.getByText('Ray Castillo')).toBeTruthy();
    });

    it('closes the confirmation when the meeting moves on while it is open', () => {
      socket.state = { ...active, agenda };
      const { rerender } = render(<ChairConsole />);
      fireEvent.click(screen.getByRole('button', { name: 'Adjourn' }));
      expect(screen.getByRole('dialog', { name: 'Adjourn the meeting?' })).toBeTruthy();

      // Someone moved, and the motion is pending: Adjourn is no longer in order
      socket.state = { ...active, agenda, currentMotion: motion };
      rerender(<ChairConsole />);
      expect(screen.queryByRole('dialog')).toBeNull();

      // And it doesn't come back by itself when Adjourn is in order again
      socket.state = { ...active, agenda };
      rerender(<ChairConsole />);
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('brings the Now column into view when an item is called from the agenda', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    socket.state = {
      ...active,
      agenda: [{ id: 2, title: "Treasurer's report", status: 'pending' }],
    };
    render(<ChairConsole />);
    fireEvent.click(screen.getByRole('button', { name: "Call Treasurer's report" }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CALL_AGENDA_ITEM', id: 2 }),
    );
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
  });

  it('jumps rather than scrolls for someone who asked for reduced motion', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' })),
    );
    socket.state = {
      ...active,
      agenda: [{ id: 2, title: "Treasurer's report", status: 'pending' }],
    };
    render(<ChairConsole />);
    fireEvent.click(screen.getByRole('button', { name: "Call Treasurer's report" }));
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    vi.unstubAllGlobals();
  });

  describe('business from the floor', () => {
    it('records a motion made by a member without a phone', async () => {
      socket.state = { ...active, members: [dana, alice, carmen] };
      render(<ChairConsole />);
      fireEvent.click(screen.getByRole('button', { name: 'A motion from the floor' }));
      const dialog = screen.getByRole('dialog', { name: 'A motion from the floor' });
      expect((within(dialog).getByLabelText('Kind of motion') as HTMLSelectElement).value).toBe(
        'mainMotion',
      );
      fireEvent.change(within(dialog).getByLabelText('The motion'), {
        target: { value: 'Plant a hedge along the fence' },
      });
      fireEvent.change(within(dialog).getByLabelText('Who moved it'), {
        target: { value: 'carm' },
      });
      // The chair is never the mover
      expect(within(dialog).queryByRole('button', { name: /Dana Okafor/ })).toBeNull();
      fireEvent.click(within(dialog).getByRole('button', { name: /Carmen Diaz/ }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Record the motion' }));
      expect(socket.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'MAKE_FLOOR_MOTION',
          motionType: 'mainMotion',
          text: 'Plant a hedge along the fence',
          moverName: '',
          moverMemberId: 5,
        }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('keeps the motion from the floor open with what was typed when the server refuses it', async () => {
      socket.state = { ...active, members: [dana, carmen] };
      socket.dispatch.mockImplementation(async () => {
        socket.error = 'Finish or set aside the election first';
        return false;
      });
      const { rerender } = render(<ChairConsole />);
      fireEvent.click(screen.getByRole('button', { name: 'A motion from the floor' }));
      fireEvent.change(screen.getByLabelText('The motion'), {
        target: { value: 'Plant a hedge' },
      });
      fireEvent.change(screen.getByLabelText('Who moved it'), {
        target: { value: 'Frank Ruiz' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Record the motion' }));
      const dialog = screen.getByRole('dialog', { name: 'A motion from the floor' });
      await waitFor(() => expect(within(dialog).getByRole('alert')).toBeTruthy());
      rerender(<ChairConsole />);
      expect(within(dialog).getByRole('alert').textContent).toBe(
        'Finish or set aside the election first',
      );
      expect((screen.getByLabelText('The motion') as HTMLTextAreaElement).value).toBe(
        'Plant a hedge',
      );
      expect((screen.getByLabelText('Who moved it') as HTMLInputElement).value).toBe('Frank Ruiz');
    });

    it('never offers the admin recording at the console as the mover', () => {
      socket.currentUser = admin;
      socket.state = { ...active, members: [dana, admin, carmen] };
      render(<ChairConsole />);
      fireEvent.click(screen.getByRole('button', { name: 'A motion from the floor' }));
      const dialog = screen.getByRole('dialog', { name: 'A motion from the floor' });
      fireEvent.change(within(dialog).getByLabelText('Who moved it'), {
        target: { value: 'a' },
      });
      expect(within(dialog).getByRole('button', { name: /Carmen Diaz/ })).toBeTruthy();
      expect(within(dialog).queryByRole('button', { name: /^Admin/ })).toBeNull();
    });

    it('keeps the second from the floor open when the server refuses it', async () => {
      const awaiting = { ...motion, mover: 'Carmen Diaz', moverId: 5, secondedBy: null };
      socket.state = { ...active, members: [dana, alice, carmen], pendingSecond: awaiting };
      socket.dispatch.mockResolvedValue(false);
      render(<ChairConsole />);
      fireEvent.click(screen.getByRole('button', { name: 'Seconded from the floor' }));
      fireEvent.change(screen.getByLabelText('Who seconded it'), { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Record the second' }));
      const form = screen.getByRole('form', { name: 'Seconded from the floor' });
      await waitFor(() =>
        expect(within(form).getByRole('alert').textContent).toBe(
          'The second was not recorded. Try again.',
        ),
      );
      expect((screen.getByLabelText('Who seconded it') as HTMLSelectElement).value).toBe('3');
    });

    it('records a motion by a name typed for someone not in the meeting', () => {
      socket.state = { ...active, members: [dana, carmen] };
      render(<ChairConsole />);
      fireEvent.click(screen.getByRole('button', { name: 'A motion from the floor' }));
      fireEvent.change(screen.getByLabelText('The motion'), {
        target: { value: 'Plant a hedge' },
      });
      fireEvent.change(screen.getByLabelText('Who moved it'), {
        target: { value: 'Frank Ruiz' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Record the motion' }));
      const sent = socket.dispatch.mock.calls[0][0];
      expect(sent).toMatchObject({ type: 'MAKE_FLOOR_MOTION', moverName: 'Frank Ruiz' });
      expect(sent).not.toHaveProperty('moverMemberId');
    });

    it('records a second from the floor beside No second', () => {
      const awaiting = { ...motion, mover: 'Carmen Diaz', moverId: 5, secondedBy: null };
      socket.state = { ...active, members: [dana, alice, carmen], pendingSecond: awaiting };
      render(<ChairConsole />);
      expect(screen.getByRole('button', { name: 'No second' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Seconded from the floor' }));
      const form = screen.getByRole('form', { name: 'Seconded from the floor' });
      // The mover can't second their own motion
      expect(within(form).queryByRole('option', { name: 'Carmen Diaz' })).toBeNull();
      fireEvent.click(within(form).getByRole('button', { name: 'Record the second' }));
      const sent = socket.dispatch.mock.calls[0][0];
      expect(sent).toMatchObject({ type: 'SECOND_FROM_FLOOR' });
      expect(sent).not.toHaveProperty('seconderMemberId');
    });

    it('records a nomination from the floor in the election card', () => {
      socket.state = {
        ...active,
        members: [dana, carmen],
        nominationsOpen: true,
        currentNominationPosition: 'Director',
      };
      render(<ChairConsole />);
      fireEvent.change(screen.getByLabelText('Nominee'), { target: { value: '5' } });
      fireEvent.click(screen.getByRole('button', { name: 'Nominate from the floor' }));
      expect(socket.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NOMINATE',
          position: 'Director',
          nomineeName: 'Carmen Diaz',
          fromFloor: true,
        }),
      );
    });
  });

  describe('the election card', () => {
    const ballot = {
      id: 7,
      position: 'Director',
      candidates: [
        { name: 'Carmen Diaz', id: 5 },
        { name: 'Ray Castillo', id: 6 },
      ],
      requiredVotes: 'majority' as const,
      votingInProgress: true,
      ballotResults: { 'Carmen Diaz': 0, 'Ray Castillo': 0 },
      votersWhoVoted: [],
      elected: null,
    };

    it("labels the chair's own ballot apart from running the election", () => {
      socket.state = { ...active, currentElection: ballot };
      render(<ChairConsole />);
      // Nothing else comes up during the ballot but setting it aside, and the card leads the
      // side column
      expect(
        within(screen.getByRole('toolbar'))
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Set the election aside']);
      const headings = screen.getAllByRole('heading').map((h) => h.textContent);
      expect(headings.indexOf('Election for Director')).toBeLessThan(
        headings.indexOf('Attendance'),
      );
      const card = screen
        .getByRole('heading', { name: 'Election for Director' })
        .closest('section')!;
      const mine = within(card).getByRole('group', { name: 'Your ballot' });
      expect(within(mine).getByRole('button', { name: 'Vote for Carmen Diaz' })).toBeTruthy();
      expect(within(mine).queryByRole('button', { name: 'Close the ballot' })).toBeNull();
      expect(within(card).getByRole('button', { name: 'Close the ballot' })).toBeTruthy();
    });

    it('sets an election aside from the card, after asking first', () => {
      socket.state = { ...active, nominationsOpen: true, currentNominationPosition: 'Director' };
      render(<ChairConsole />);
      const card = screen
        .getByRole('heading', { name: 'Election for Director' })
        .closest('section')!;
      fireEvent.click(within(card).getByRole('button', { name: 'Set the election aside' }));
      expect(socket.dispatch).not.toHaveBeenCalled();
      const dialog = screen.getByRole('dialog', { name: 'Set the election aside?' });
      expect(
        within(dialog).getByText(/The election for Director ends without a result/),
      ).toBeTruthy();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Set it aside' }));
      expect(socket.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SET_ASIDE_ELECTION' }),
      );
    });

    it('offers no ballot without a nominee, and the toolbar sets the election aside or adjourns', () => {
      socket.state = {
        ...active,
        currentNominationPosition: 'Director',
        nominations: [
          {
            id: 1,
            position: 'Director',
            nomineeName: 'Carmen Diaz',
            nomineeId: 5,
            nominatedBy: 'Alice Brennan',
            nominatorId: 3,
            timestamp: '8:00:00 PM',
            declined: true,
          },
        ],
      };
      render(<ChairConsole />);
      expect(screen.getByText(/Nobody has been nominated\. Open nominations again/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Open the ballot' })).toBeNull();
      // The question card says where the election stands
      expect(screen.getByText('Nominations are closed')).toBeTruthy();
      const toolbar = screen.getByRole('toolbar');
      expect(
        within(toolbar)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Set the election aside', 'Adjourn']);
      fireEvent.click(within(toolbar).getByRole('button', { name: 'Set the election aside' }));
      expect(screen.getByRole('dialog', { name: 'Set the election aside?' })).toBeTruthy();
    });

    it('closes the set-aside confirmation once the election has ended', () => {
      socket.state = { ...active, nominationsOpen: true, currentNominationPosition: 'Director' };
      const { rerender } = render(<ChairConsole />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Set the election aside' })[0]);
      expect(screen.getByRole('dialog', { name: 'Set the election aside?' })).toBeTruthy();
      socket.state = { ...active };
      rerender(<ChairConsole />);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('keeps ELECTED up with its tally after the winner is declared', () => {
      socket.state = {
        ...active,
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
      render(<ChairConsole />);
      expect(
        screen.getByRole('figure', { name: 'Elected, Carmen Diaz 9, Ray Castillo 5' }),
      ).toBeTruthy();
    });
  });
});
