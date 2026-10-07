import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { Election, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { ElectionPanel } from '../ElectionPanel';

const dana: Member = { id: 2, name: 'Dana Okafor', role: 'chair', present: true };
const alice: Member = { id: 3, name: 'Alice Brennan', role: 'member', present: true };
const sam: Member = { id: 11, name: 'Sam Ortiz', role: 'guest', present: true };

const election = (overrides: Partial<Election> = {}): Election => ({
  id: 7,
  position: 'Director',
  candidates: [
    { name: 'Carmen Diaz', id: 5 },
    { name: 'Ray Castillo', id: 6 },
  ],
  requiredVotes: 'majority',
  votingInProgress: true,
  ballotResults: { 'Carmen Diaz': 0, 'Ray Castillo': 0 },
  votersWhoVoted: [],
  floorBallots: {},
  elected: null,
  ...overrides,
});

const base: MeetingState = {
  ...initialState,
  meetingActive: true,
  members: [dana, alice, sam],
  currentNominationPosition: 'Director',
  nominations: [
    {
      id: 1,
      position: 'Director',
      nomineeName: 'Carmen Diaz',
      nomineeId: 5,
      nominatedBy: 'Alice Brennan',
      nominatorId: 3,
      timestamp: '',
      declined: false,
    },
  ],
};

const dispatch = vi.fn();

describe('ElectionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the ballot once nominations close, with the vote required', () => {
    render(<ElectionPanel state={base} dispatch={dispatch} currentUser={dana} isChair />);
    expect(screen.getByText('Candidates: Carmen Diaz')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Vote required'), { target: { value: '2/3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open the ballot' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'START_ELECTION',
        position: 'Director',
        requiredVotes: '2/3',
      }),
    );
  });

  it('takes a ballot from a member, once', () => {
    const { unmount } = render(
      <ElectionPanel
        state={{ ...base, currentElection: election() }}
        dispatch={dispatch}
        currentUser={alice}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Vote for Carmen Diaz' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'CAST_BALLOT',
      candidateName: 'Carmen Diaz',
      voterId: 3,
    });
    unmount();

    render(
      <ElectionPanel
        state={{ ...base, currentElection: election({ votersWhoVoted: [3] }) }}
        dispatch={dispatch}
        currentUser={alice}
      />,
    );
    expect(screen.getByText('Ballot recorded')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Vote for Carmen Diaz' })).toBeNull();
  });

  it('gives a guest no ballot', () => {
    render(
      <ElectionPanel
        state={{ ...base, currentElection: election() }}
        dispatch={dispatch}
        currentUser={sam}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Vote for Carmen Diaz' })).toBeNull();
  });

  it('takes the paper ballots by candidate, and closes the ballot', () => {
    render(
      <ElectionPanel
        state={{ ...base, currentElection: election() }}
        dispatch={dispatch}
        currentUser={dana}
        isChair
      />,
    );
    fireEvent.change(screen.getByLabelText('Carmen Diaz in the room'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Ray Castillo in the room'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter the paper ballots' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SET_FLOOR_BALLOTS',
        counts: { 'Carmen Diaz': 9, 'Ray Castillo': 5 },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close the ballot' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'CLOSE_ELECTION' }));
  });

  it('declares the winner', () => {
    const closed = election({
      votingInProgress: false,
      ballotResults: { 'Carmen Diaz': 12, 'Ray Castillo': 6 },
      elected: 'Carmen Diaz',
    });
    render(
      <ElectionPanel
        state={{ ...base, currentElection: closed }}
        dispatch={dispatch}
        currentUser={dana}
        isChair
      />,
    );
    expect(screen.getByText('Carmen Diaz 12, Ray Castillo 6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Declare Carmen Diaz elected' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DECLARE_ELECTED', candidateName: 'Carmen Diaz' }),
    );
  });
});
