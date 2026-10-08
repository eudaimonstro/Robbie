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
    for (const name of ['Vote yes', 'Vote no', 'Vote abstain']) {
      expect(screen.getByRole('button', { name }).className).toContain('btn-lg');
    }
    expect(screen.queryByRole('button', { name: 'Ask to speak' })).toBeNull();
    expect(screen.queryByLabelText('Motion text')).toBeNull();
  });

  it('says aloud a motion awaiting your second, and that you have the floor, with a buzz', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const { rerender } = renderAs(ben, {
      ...active,
      pendingSecond: { ...motion, secondedBy: null },
    });
    const announcer = screen.getByTestId('phone-announcer');
    expect(announcer.textContent).toBe('A motion awaits a second: Resurface the pool this spring');
    socket.state = {
      ...active,
      currentMotion: motion,
      motionStack: [motion],
      recognizedSpeaker: ben,
    };
    rerender(<PhoneView />);
    expect(announcer.textContent).toBe('You have the floor');
    expect(vibrate).toHaveBeenCalledWith(200);
  });

  it('says aloud when a vote or a ballot opens, from a region already on the page', () => {
    const { rerender } = renderAs(alice, {
      ...active,
      currentMotion: motion,
      motionStack: [motion],
    });
    const announcer = screen.getByTestId('phone-announcer');
    expect(announcer.getAttribute('role')).toBe('status');
    expect(announcer.textContent).toBe('Debate is open: Resurface the pool this spring');

    socket.state = voting;
    rerender(<PhoneView />);
    expect(screen.getByTestId('phone-announcer')).toBe(announcer);
    expect(announcer.textContent).toBe('The vote is open: Resurface the pool this spring');

    socket.state = {
      ...active,
      currentElection: {
        id: 1,
        position: 'Treasurer',
        candidates: [{ name: 'Carmen Diaz', id: 5 }],
        requiredVotes: 'majority',
        votingInProgress: true,
        ballotResults: {},
        votersWhoVoted: [],
        elected: null,
      },
    };
    rerender(<PhoneView />);
    expect(announcer.textContent).toBe('The ballot is open for Treasurer');
  });

  it('votes, and says the vote was recorded', () => {
    renderAs(ben, voting);
    fireEvent.click(screen.getByRole('button', { name: 'Vote yes' }));
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

  it('lets the mover withdraw their motion, at once while it awaits a second, by asking once stated', () => {
    socket.dispatch.mockResolvedValue(true);
    renderAs(alice, { ...active, pendingSecond: { ...motion, secondedBy: null } });
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw my motion' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WITHDRAW_MOTION', requesterId: 3 }),
    );
    cleanup();
    renderAs(alice, { ...active, currentMotion: motion, motionStack: [motion] });
    expect(screen.getByText(/the chair asks the meeting's permission/)).toBeTruthy();
    cleanup();
    // Nobody else sees it
    renderAs(ben, { ...active, currentMotion: motion, motionStack: [motion] });
    expect(screen.queryByRole('button', { name: 'Withdraw my motion' })).toBeNull();
  });

  it('lets a member ask to speak in an open forum, with nothing pending', () => {
    renderAs(alice, active);
    fireEvent.click(screen.getByRole('button', { name: 'Ask to speak' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RAISE_HAND', stance: 'neutral' }),
    );
    cleanup();
    renderAs(alice, { ...active, speakerQueue: [{ member: alice, stance: 'neutral' }] });
    expect(screen.getByText('You asked to speak: 1 of 1 waiting.')).toBeTruthy();
  });

  it('says debate is closed once it is, with no hand to raise', () => {
    const closed = { ...motion, debateClosed: true };
    renderAs(ben, { ...active, currentMotion: closed, motionStack: [closed] });
    expect(
      screen.getByText('Debate is closed. The chair puts the question to the vote.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask to speak' })).toBeNull();
  });

  it('raises a point of order during a vote, while a motion awaits a second, and during consent', () => {
    socket.dispatch.mockResolvedValue(true);
    for (const state of [
      voting,
      { ...active, pendingSecond: { ...motion, secondedBy: null } },
      { ...active, currentMotion: motion, motionStack: [motion], unanimousConsentPending: true },
    ]) {
      renderAs(ben, state);
      fireEvent.click(screen.getByText('Point of order', { selector: 'summary' }));
      fireEvent.change(screen.getByLabelText('What is out of order'), {
        target: { value: 'Guests are voting' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Raise the point of order' }));
      expect(socket.dispatch).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'MAKE_MOTION',
          motionType: 'pointOrder',
          text: 'Guests are voting',
        }),
      );
      cleanup();
    }
  });

  it("tells the room the chair is asking about a mover's request to withdraw", () => {
    const request = { ...motion, id: 2, type: 'withdrawMotion', mover: 'Alice Brennan' };
    renderAs(ben, { ...active, currentMotion: request, motionStack: [motion, request] });
    expect(
      screen.getByText('Alice Brennan asks to withdraw the motion. The chair asks the room.'),
    ).toBeTruthy();
  });

  it('makes another motion in plain words, each saying what it does', () => {
    renderAs(alice, active);
    fireEvent.click(screen.getByText('Other motions', { selector: 'summary' }));
    expect(screen.getByText('Take a short break')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /^Recess/ }));
    const recess = screen.getByRole('form', { name: 'Recess' });
    fireEvent.change(within(recess).getByLabelText('Until (optional)'), {
      target: { value: '20:15' },
    });
    fireEvent.click(within(recess).getByRole('button', { name: 'Move' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MAKE_MOTION',
        motionType: 'recess',
        moverId: 3,
        text: 'Recess until 8:15 PM',
        recessUntil: '8:15 PM',
      }),
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

  it('puts the minutes in place of an empty question while they are the business', () => {
    renderAs(alice, {
      ...active,
      currentAgendaItem: { id: 2, title: 'Approval of the minutes', status: 'active' },
      minutesFromPreviousMeeting: '## Minutes of the 2025 Annual Meeting\n\nText.',
    });
    expect(screen.getByText('Minutes of the 2025 Annual Meeting')).toBeTruthy();
    expect(screen.getByText('Any corrections?')).toBeTruthy();
    expect(screen.queryByText('No question is pending.')).toBeNull();
  });

  it('asks no motion of a member while the minutes are being approved', () => {
    const atTheMinutes: MeetingState = {
      ...active,
      currentAgendaItem: { id: 2, title: 'Approval of the minutes', status: 'active' },
      minutesFromPreviousMeeting: '## Minutes of the 2025 Annual Meeting\n\nText.',
    };
    const { unmount } = renderAs(alice, atTheMinutes);
    expect(screen.queryByLabelText('Motion text')).toBeNull();
    expect(screen.getByText(/To offer a correction/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ask the chair' })).toBeTruthy();
    unmount();

    // Once they are approved, the meeting moves on: a motion again
    renderAs(alice, {
      ...atTheMinutes,
      minutesApproved: true,
      minutesApproval: { corrections: null, timestamp: '' },
    });
    expect(screen.getByLabelText('Motion text')).toBeTruthy();
    expect(screen.queryByText(/To offer a correction/)).toBeNull();
  });

  it('tells a guest the minutes are being approved, without their text', () => {
    renderAs(sam, {
      ...active,
      currentAgendaItem: { id: 2, title: 'Approval of the minutes', status: 'active' },
      minutesFromPreviousMeeting: '',
      previousMinutesId: 'm1',
    });
    expect(screen.getByText('The minutes of the previous meeting')).toBeTruthy();
    expect(screen.getByText('Any corrections?')).toBeTruthy();
  });

  it('gives a guest a Guest badge and Ask the chair, and no vote', () => {
    renderAs(sam, voting);
    expect(screen.getByText('Guest')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Vote / })).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Ask the chair' })).toBeTruthy();
  });

  it('lets a guest ask to speak while the floor is open: in debate, or with nothing pending', () => {
    const { unmount } = renderAs(sam, voting);
    expect(screen.queryByRole('button', { name: 'Ask to speak' })).toBeNull();
    expect(
      screen.getByText('You can ask to speak while the floor is open for debate.'),
    ).toBeTruthy();
    unmount();

    // An open forum: nothing pending
    renderAs(sam, active);
    expect(screen.getByRole('button', { name: 'Ask to speak' })).toBeTruthy();
    cleanup();

    renderAs(sam, { ...active, currentMotion: motion, motionStack: [motion] });
    fireEvent.click(screen.getByRole('button', { name: 'Ask to speak' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RAISE_HAND', stance: 'neutral' }),
    );
  });

  describe('the speakers waiting, in the order the chair will call them', () => {
    const debating = { ...active, currentMotion: motion, motionStack: [motion] };
    const spoken = { ...motion, moverHasSpoken: true };
    const speakerNames = () =>
      within(screen.getByRole('region', { name: 'Speakers' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent);

    it('lists the mover first, though another member asked first', () => {
      renderAs(dana, {
        ...debating,
        speakerQueue: [
          { member: ben, stance: 'con' },
          { member: alice, stance: 'pro' },
        ],
      });
      expect(speakerNames()).toEqual(['1. Alice Brennan (For)', '2. Ben Whitaker (Against)']);
    });

    it('lists a speaker on the other side next, after the last speaker', () => {
      renderAs(dana, {
        ...debating,
        currentMotion: spoken,
        motionStack: [spoken],
        lastSpeakerStance: 'pro',
        speakerQueue: [
          { member: ben, stance: 'pro' },
          { member: sam, stance: 'con' },
        ],
      });
      expect(speakerNames()).toEqual(['1. Sam Ortiz (Against)', '2. Ben Whitaker (For)']);
    });

    it('tells a member who asked before the mover that the mover speaks first', () => {
      renderAs(ben, {
        ...debating,
        speakerQueue: [
          { member: ben, stance: 'con' },
          { member: alice, stance: 'pro' },
        ],
      });
      expect(screen.getByText(/You asked to speak/).textContent).toBe(
        'You asked to speak: 2 of 2 waiting, against.',
      );
    });
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
