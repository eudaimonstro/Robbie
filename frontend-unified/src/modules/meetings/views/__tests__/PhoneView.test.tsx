import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Member, Motion } from '@robbie-bylawyer/shared/types';

const socket = vi.hoisted(() => ({
  state: null as unknown as MeetingState,
  currentUser: null as unknown as Member,
  dispatch: vi.fn(),
  leaveMeeting: vi.fn(),
}));
vi.mock('../../context/SocketContext', () => ({ useSocket: () => socket }));

const { PhoneView } = await import('../PhoneView');

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
  });

  it('shows the question and three vote buttons while the vote is open, and nothing else to do', () => {
    renderAs(ben, voting);
    expect(screen.getByRole('heading', { name: 'Special meeting' })).toBeTruthy();
    expect(screen.getByText('Resurface the pool this spring')).toBeTruthy();
    for (const name of ['Vote yea', 'Vote nay', 'Vote abstain']) {
      expect(screen.getByRole('button', { name }).className).toContain('btn-lg');
    }
    expect(screen.queryByRole('button', { name: 'Raise hand' })).toBeNull();
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

  it('raises a hand with a position during debate', () => {
    renderAs(ben, { ...active, currentMotion: motion, motionStack: [motion] });
    fireEvent.click(screen.getByRole('button', { name: 'Against' }));
    fireEvent.click(screen.getByRole('button', { name: 'Raise hand' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RAISE_HAND', stance: 'con' }),
    );
  });

  it('makes a motion when nothing is pending', () => {
    renderAs(alice, active);
    fireEvent.change(screen.getByLabelText('Motion text'), {
      target: { value: 'I move that we resurface the pool' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Motion' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: 'I move that we resurface the pool',
        moverId: 3,
      }),
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

  it('gives a guest a Guest badge, Request the floor and Ask the chair, and no vote', () => {
    renderAs(sam, voting);
    expect(screen.getByText('Guest')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Vote / })).toHaveLength(0);
    expect(screen.getByText('Ask the chair')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Request the floor' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RAISE_HAND', stance: 'neutral' }),
    );
  });

  it('shows the last result with both parts', () => {
    renderAs(ben, {
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
    });
    expect(screen.getByText('Carried')).toBeTruthy();
    expect(screen.getByText('On devices 2 to 0, in the room 9 to 2: 11 to 2')).toBeTruthy();
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
