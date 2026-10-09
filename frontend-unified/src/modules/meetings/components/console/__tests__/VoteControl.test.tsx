import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Member, Motion } from '@robbie-bylawyer/shared/types';
import { VoteControl } from '../VoteControl';

const dana: Member = { id: 2, name: 'Dana Okafor', role: 'chair', present: true };
const pat: Member = { id: 1, name: 'Pat Lindqvist', role: 'admin', present: true };
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
const pending: MeetingState = {
  ...initialState,
  meetingActive: true,
  agendaAdopted: true,
  members: [pat, dana],
  currentMotion: motion,
  motionStack: [motion],
};
const voting: MeetingState = {
  ...pending,
  votingOpen: true,
  votes: { yea: 2, nay: 0, abstain: 0 },
  voters: [3, 4],
  voterChoices: { 3: 'yea', 4: 'yea' },
};

const dispatch = vi.fn();

describe('VoteControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks how the vote will be taken, a voice vote included', () => {
    render(<VoteControl state={pending} dispatch={dispatch} me={dana} />);
    const method = screen.getByLabelText('How the vote is taken');
    expect(screen.getByRole('option', { name: 'Voice vote or show of hands' })).toBeTruthy();
    fireEvent.change(method, { target: { value: 'voice' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_VOTING_METHOD', method: 'voice' });
  });

  it('shows the device votes and takes the count in the room', () => {
    render(<VoteControl state={voting} dispatch={dispatch} me={dana} />);
    expect(screen.getByText('2 voted on devices')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Yea in the room'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Nay in the room'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter the count' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_FLOOR_TALLY', yea: 9, nay: 2, abstain: 0 }),
    );
  });

  it('adds the count in the room to the device votes', () => {
    render(
      <VoteControl
        state={{ ...voting, floorVotes: { yea: 9, nay: 2, abstain: 0 } }}
        dispatch={dispatch}
        me={dana}
      />,
    );
    expect(screen.getByText('Together: 11 to 2')).toBeTruthy();
  });

  it("offers no vote to a presiding officer who isn't a director", () => {
    const tied = {
      ...voting,
      kind: 'board' as const,
      board: { directors: 5 },
      votes: { yea: 1, nay: 3, abstain: 0 },
      voters: [3, 4, 5, 6],
      floorVotes: { yea: 2, nay: 0, abstain: 0 },
    };
    const { unmount } = render(
      <VoteControl state={tied} dispatch={dispatch} me={{ ...dana, nonVoting: true }} />,
    );
    expect(screen.queryByText(/The chair may vote/)).toBeNull();
    unmount();
    render(<VoteControl state={tied} dispatch={dispatch} me={{ ...pat, nonVoting: true }} />);
    expect(screen.queryByRole('button', { name: 'Vote yea' })).toBeNull();
  });

  it('lets the chair of a small board vote like any director (RONR 49:21)', () => {
    const board = { ...voting, kind: 'board' as const, board: { directors: 5 } };
    render(<VoteControl state={board} dispatch={dispatch} me={dana} />);
    expect(screen.queryByText(/The chair may vote/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Vote yea' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CAST_VOTE', vote: 'yea', voterId: 2 }),
    );
  });

  it('offers the chair a deciding vote, judged on both counts', () => {
    const tied = {
      ...voting,
      votes: { yea: 1, nay: 3, abstain: 0 },
      voters: [3, 4, 5, 6],
      floorVotes: { yea: 2, nay: 0, abstain: 0 },
    };
    const { unmount } = render(<VoteControl state={tied} dispatch={dispatch} me={dana} />);
    expect(screen.getByText('The chair may vote to break the tie')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vote yea' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CAST_VOTE',
        vote: 'yea',
        voterId: 2,
        isChairDecidingVote: true,
      }),
    );
    unmount();

    // On devices alone it would be a tie; with the room the chair's vote changes nothing
    const decided = {
      ...tied,
      votes: { yea: 2, nay: 2, abstain: 0 },
      floorVotes: { yea: 0, nay: 3, abstain: 0 },
    };
    render(<VoteControl state={decided} dispatch={dispatch} me={dana} />);
    expect(screen.queryByText(/The chair may vote/)).toBeNull();
  });

  it('lets an admin vote like a member', () => {
    render(<VoteControl state={voting} dispatch={dispatch} me={pat} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vote nay' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CAST_VOTE', vote: 'nay', voterId: 1 }),
    );
  });

  it("keeps a secret ballot's counts hidden until it closes", () => {
    render(
      <VoteControl
        state={{ ...voting, votingMethod: 'ballot', voterChoices: {} }}
        dispatch={dispatch}
        me={dana}
      />,
    );
    expect(screen.getByText(/ballots received on devices/)).toBeTruthy();
    expect(screen.queryByText('Yea on devices')).toBeNull();
  });

  it('closes the vote', () => {
    render(<VoteControl state={voting} dispatch={dispatch} me={dana} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close the vote' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'CLOSE_VOTING' }));
  });

  it('takes the count in the room before the chair votes, as the server does', () => {
    const chairVoted = {
      ...voting,
      votes: { yea: 3, nay: 2, abstain: 0 },
      voters: [3, 4, 2],
      voterChoices: { 3: 'yea' as const, 4: 'yea' as const, 2: 'yea' as const },
    };
    render(<VoteControl state={chairVoted} dispatch={dispatch} me={pat} />);
    expect(screen.getByText('The floor tally must be entered before the chair votes')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enter the count' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('lets the chair declare a voice vote by what the room said, on a majority question only', () => {
    const voice = { ...voting, votingMethod: 'voice' as const, votes: initialState.votes };
    const { unmount } = render(<VoteControl state={voice} dispatch={dispatch} me={dana} />);
    fireEvent.click(screen.getByRole('button', { name: 'The ayes have it' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CLOSE_VOTING', declared: 'ayes' }),
    );
    expect(screen.getByRole('button', { name: 'The noes have it' })).toBeTruthy();
    unmount();

    // Two thirds is counted
    const closeDebate = {
      ...MOTIONS.previousQuestion,
      ...motion,
      type: 'previousQuestion',
      vote: '2/3' as const,
    };
    render(
      <VoteControl
        state={{ ...voice, currentMotion: closeDebate, motionStack: [closeDebate] }}
        dispatch={dispatch}
        me={dana}
      />,
    );
    expect(screen.queryByRole('button', { name: 'The ayes have it' })).toBeNull();
    expect(screen.getByText('Counted in the room: enter the count below.')).toBeTruthy();
  });

  it('says how many yes votes a question of all the voting members needs', () => {
    const bylaw: Motion = {
      ...MOTIONS.bylawAmendment,
      ...motion,
      type: 'bylawAmendment',
      vote: '2/3',
      bylawAmendment: {
        documentId: 'd',
        changeType: 'delete',
        voteRequired: { fraction: '2/3', of: 'members', members: 142 },
      },
    };
    render(
      <VoteControl
        state={{
          ...voting,
          currentMotion: bylaw,
          motionStack: [bylaw],
          floorVotes: { yea: 60, nay: 4, abstain: 0 },
        }}
        dispatch={dispatch}
        me={dana}
      />,
    );
    expect(screen.getByText('95 yes votes needed: 62 so far')).toBeTruthy();
  });

  it('closes a voice vote only once the show of hands is entered', () => {
    const voice = { ...voting, votingMethod: 'voice' as const, votes: initialState.votes };
    const { unmount } = render(<VoteControl state={voice} dispatch={dispatch} me={dana} />);
    const close = screen.getByRole('button', { name: 'Close the vote' });
    expect(close.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Enter the show of hands before closing')).toBeTruthy();
    unmount();

    render(
      <VoteControl
        state={{ ...voice, floorVotes: { yea: 9, nay: 2, abstain: 0 } }}
        dispatch={dispatch}
        me={dana}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close the vote' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'CLOSE_VOTING' }));
  });
});
