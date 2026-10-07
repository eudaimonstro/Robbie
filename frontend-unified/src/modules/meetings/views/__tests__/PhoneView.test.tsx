import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Member, Motion } from '@robbie-bylawyer/shared/types';

const socket = vi.hoisted(() => ({
  state: null as unknown as MeetingState,
  currentUser: null as unknown as Member,
  dispatch: vi.fn(),
  leaveMeeting: vi.fn(),
  error: null as string | null,
}));
vi.mock('../../context/SocketContext', () => ({ useSocket: () => socket }));

const { PhoneView } = await import('../PhoneView');
const { AppChromeContext } = await import('../../../../components/layout/appChrome');

const dana: Member = {
  id: 2,
  name: 'Dana Okafor',
  role: 'chair',
  present: true,
  presentBy: 'device',
};
const alice: Member = {
  id: 3,
  name: 'Alice Brennan',
  role: 'member',
  present: true,
  presentBy: 'device',
};
const ben: Member = {
  id: 4,
  name: 'Ben Whitaker',
  role: 'member',
  present: true,
  presentBy: 'device',
};
const sam: Member = {
  id: 11,
  name: 'Sam Ortiz',
  role: 'guest',
  present: true,
  presentBy: 'device',
};
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
const active: MeetingState = {
  ...initialState,
  meetingCode: 'MAPLE1',
  title: 'Special meeting',
  meetingActive: true,
  agendaAdopted: true,
  members: [dana, alice, ben, sam],
};
const voting: MeetingState = {
  ...active,
  currentMotion: motion,
  motionStack: [motion],
  votingOpen: true,
};

function renderAs(me: Member, state: MeetingState) {
  socket.currentUser = me;
  socket.state = state;
  return render(<PhoneView />);
}

describe('PhoneView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The server applies each action, unless a test says otherwise
    socket.dispatch.mockResolvedValue(true);
    socket.error = null;
  });

  it('shows the question and three vote buttons while the vote is open, and nothing else to do', () => {
    renderAs(ben, voting);
    expect(screen.getByRole('heading', { name: 'Special meeting' })).toBeTruthy();
    expect(screen.getByText('Resurface the pool this spring')).toBeTruthy();
    for (const name of ['Vote yea', 'Vote nay', 'Vote abstain']) {
      expect(screen.getByRole('button', { name }).className).toContain('btn-lg');
    }
    expect(screen.queryByRole('button', { name: 'Ask to speak' })).toBeNull();
    expect(screen.queryByLabelText('Motion text')).toBeNull();
  });

  it('votes, and says the vote was recorded', () => {
    renderAs(ben, voting);
    fireEvent.click(screen.getByRole('button', { name: 'Vote yea' }));
    expect(socket.dispatch).toHaveBeenCalledWith({ type: 'CAST_VOTE', vote: 'yea', voterId: 4 });
  });

  it('says a secret ballot was recorded without showing the choice', () => {
    renderAs(ben, { ...voting, votingMethod: 'ballot', voters: [4], voterChoices: {} });
    expect(screen.getByText('Vote recorded')).toBeTruthy();
  });

  it('seconds a motion someone else moved, and tells the mover to wait', () => {
    const awaiting = { ...active, pendingSecond: { ...motion, secondedBy: null } };
    const { unmount } = renderAs(ben, awaiting);
    fireEvent.click(screen.getByRole('button', { name: 'Second' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SECOND_MOTION', seconder: 'Ben Whitaker' }),
    );
    unmount();

    renderAs(alice, awaiting);
    expect(screen.queryByRole('button', { name: 'Second' })).toBeNull();
    expect(screen.getByText('You moved this. Another member must second it.')).toBeTruthy();
  });

  it('asks to speak with a position during debate', () => {
    renderAs(ben, { ...active, currentMotion: motion, motionStack: [motion] });
    fireEvent.click(screen.getByRole('button', { name: 'Against' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask to speak' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RAISE_HAND', stance: 'con' }),
    );
  });

  it('makes a motion when nothing is pending', () => {
    renderAs(alice, active);
    expect(screen.getByRole('heading', { name: 'Make a motion' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Motion text'), {
      target: { value: 'I move that we resurface the pool' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: 'I move that we resurface the pool',
        moverId: 3,
      }),
    );
  });

  it('keeps the motion typed, with the reason, when the server refuses it', async () => {
    socket.dispatch.mockImplementation(async () => {
      socket.error = 'Finish or set aside the election first';
      return false;
    });
    const { rerender } = renderAs(alice, active);
    fireEvent.change(screen.getByLabelText('Motion text'), {
      target: { value: 'I move that we resurface the pool' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    rerender(<PhoneView />);
    expect(screen.getByRole('alert').textContent).toBe('Finish or set aside the election first');
    expect((screen.getByLabelText('Motion text') as HTMLTextAreaElement).value).toBe(
      'I move that we resurface the pool',
    );
  });

  it('lets a member nominate while nominations are open', () => {
    renderAs(alice, { ...active, nominationsOpen: true, currentNominationPosition: 'Treasurer' });
    expect(screen.getByLabelText('Nominee')).toBeTruthy();
  });

  it('lets a member cast a ballot in an election', () => {
    renderAs(alice, {
      ...active,
      currentElection: {
        id: 1,
        position: 'Treasurer',
        candidates: [{ name: 'Alice', id: 3 }],
        requiredVotes: 'majority',
        votingInProgress: true,
        ballotResults: { Alice: 0 },
        votersWhoVoted: [],
        elected: null,
      },
    });
    expect(screen.getByRole('button', { name: 'Vote for Alice' })).toBeTruthy();
  });

  it('waits for the chair once nominations close, with the nominees and no motion form', () => {
    renderAs(alice, {
      ...active,
      currentNominationPosition: 'Treasurer',
      nominations: [
        {
          id: 1,
          position: 'Treasurer',
          nomineeName: 'Carmen Diaz',
          nomineeId: 5,
          nominatedBy: 'Ben Whitaker',
          nominatorId: 4,
          timestamp: '8:00:00 PM',
          declined: false,
        },
      ],
    });
    const part = screen.getByRole('region', { name: 'Your part' });
    expect(within(part).getByText('Nominated: Carmen Diaz')).toBeTruthy();
    expect(within(part).getByText('Waiting for the chair.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Make a motion' })).toBeNull();
    expect(screen.queryByLabelText('Motion text')).toBeNull();
  });

  it('waits for the chair to declare the winner of an election', () => {
    renderAs(alice, {
      ...active,
      currentElection: {
        id: 1,
        position: 'Treasurer',
        candidates: [{ name: 'Carmen Diaz', id: 5 }],
        requiredVotes: 'majority',
        votingInProgress: false,
        ballotResults: { 'Carmen Diaz': 9 },
        votersWhoVoted: [3, 4],
        elected: 'Carmen Diaz',
      },
    });
    const part = screen.getByRole('region', { name: 'Your part' });
    expect(within(part).getByText('Carmen Diaz has the vote required.')).toBeTruthy();
    expect(within(part).getByText('Waiting for the chair.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Make a motion' })).toBeNull();
  });

  it('offers only privileged and incidental motions during an election', () => {
    // A question debated while nominations wait for the ballot: amending it or referring it is
    // refused by the server until the election is done or set aside
    renderAs(alice, {
      ...active,
      currentNominationPosition: 'Treasurer',
      currentMotion: motion,
      motionStack: [motion],
    });
    fireEvent.click(screen.getByText('Other motions', { selector: 'summary' }));
    const categories = within(screen.getByRole('region', { name: 'Your part' }))
      .getAllByRole('radio')
      .map((radio) => MOTIONS[(radio as HTMLInputElement).value].category);
    expect(categories.length).toBeGreaterThan(0);
    expect(categories.every((c) => c === 'privileged' || c === 'incidental')).toBe(true);
  });

  it('makes another motion in plain words, each saying what it does', () => {
    renderAs(alice, active);
    fireEvent.click(screen.getByText('Other motions', { selector: 'summary' }));
    expect(screen.getByText('Take a short break')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/^Recess/));
    const recess = screen.getByLabelText(/^Recess/).closest('div')!;
    fireEvent.click(within(recess).getByRole('button', { name: 'Move' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MAKE_MOTION', motionType: 'recess', moverId: 3 }),
    );
  });

  it('asks the chair a question in plain words, with no footnote', () => {
    renderAs(alice, active);
    expect(screen.getByRole('heading', { name: 'Ask the chair' })).toBeTruthy();
    expect(screen.queryByText(/RONR/)).toBeNull();
    fireEvent.click(screen.getByLabelText(/^For information/));
    fireEvent.change(screen.getByLabelText('Your question'), {
      target: { value: 'What does resurfacing cost?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ASK_INQUIRY',
        inquiryType: 'information',
        question: 'What does resurfacing cost?',
      }),
    );
    expect(screen.getByLabelText(/^About the rules/)).toBeTruthy();
  });

  it('gives a guest a Guest badge and Ask the chair, and no vote', () => {
    renderAs(sam, voting);
    expect(screen.getByText('Guest')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Vote / })).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Ask the chair' })).toBeTruthy();
  });

  it('lets a guest ask to speak only while a debatable motion is pending', () => {
    const { unmount } = renderAs(sam, voting);
    expect(screen.queryByRole('button', { name: 'Ask to speak' })).toBeNull();
    expect(screen.getByText('You can ask to speak once a motion is being debated.')).toBeTruthy();
    unmount();

    renderAs(sam, active);
    expect(screen.queryByRole('button', { name: 'Ask to speak' })).toBeNull();
    cleanup();

    renderAs(sam, { ...active, currentMotion: motion, motionStack: [motion] });
    fireEvent.click(screen.getByRole('button', { name: 'Ask to speak' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RAISE_HAND', stance: 'neutral' }),
    );
  });

  describe('the result', () => {
    const decided: MeetingState = {
      ...active,
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

    it('sits at the top, above any form, with both parts', () => {
      renderAs(ben, decided);
      expect(screen.getByText('Carried')).toBeTruthy();
      expect(screen.getByText('On devices 2 to 0, in the room 9 to 2: 11 to 2')).toBeTruthy();
      const result = screen.getByRole('region', { name: 'The result' });
      const part = screen.getByRole('region', { name: 'Your part' });
      expect(result.compareDocumentPosition(part) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('goes when the next question is stated', () => {
      renderAs(ben, { ...decided, pendingSecond: { ...motion, id: 2, secondedBy: null } });
      expect(screen.queryByText('Carried')).toBeNull();
    });
  });

  it('shows only the adjournment once the meeting is adjourned, at the top', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderAs(alice, {
      ...active,
      meetingActive: false,
      meetingStage: 'adjourned',
      meetingLog: [
        {
          time: '7:45:00 PM',
          message: 'Vote: Yea 11, Nay 2. CARRIED.',
        },
        { time: '8:42:15 PM', message: 'Meeting adjourned.' },
      ],
    });
    expect(screen.getByText('The meeting was adjourned at 8:42 PM')).toBeTruthy();
    expect(screen.getByRole('banner').textContent).toContain('Adjourned');
    expect(screen.queryByText('The meeting is adjourned.')).toBeNull();
    expect(screen.queryByText('Carried')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ask the chair' })).toBeNull();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("opens the app's menu from the meeting's header, which stands in for the app's", () => {
    const openMenu = vi.fn();
    const setOwnHeader = vi.fn();
    socket.currentUser = alice;
    socket.state = active;
    render(
      <AppChromeContext.Provider value={{ openMenu, setOwnHeader }}>
        <PhoneView />
      </AppChromeContext.Provider>,
    );
    expect(setOwnHeader).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(openMenu).toHaveBeenCalled();
  });

  it('leaves the meeting from the header', () => {
    renderAs(alice, active);
    fireEvent.click(screen.getByRole('button', { name: 'Leave meeting' }));
    expect(socket.leaveMeeting).toHaveBeenCalled();
  });

  it('keeps clear of the home indicator on a phone', () => {
    const { container } = renderAs(ben, active);
    expect((container.firstChild as HTMLElement).className).toContain('safe-area-inset-bottom');
  });
});
