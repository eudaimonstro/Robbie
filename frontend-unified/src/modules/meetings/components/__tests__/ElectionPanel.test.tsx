import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
    // Without a quorum it asks first, and the ballot is opened as confirmed
    expect(dispatch).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'There is no quorum' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open the ballot anyway' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'START_ELECTION',
        position: 'Director',
        requiredVotes: '2/3',
        confirmedWithoutQuorum: true,
      }),
    );
  });

  it('opens the ballot at once with a quorum present', () => {
    render(
      <ElectionPanel
        state={{ ...base, quorum: 1 }}
        dispatch={dispatch}
        currentUser={dana}
        isChair
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open the ballot' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.not.objectContaining({ confirmedWithoutQuorum: true }),
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

  it('closes no ballot nobody has cast', () => {
    render(
      <ElectionPanel
        state={{ ...base, currentElection: election() }}
        dispatch={dispatch}
        currentUser={dana}
        isChair
      />,
    );
    expect(screen.getByRole('button', { name: 'Close the ballot' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(
      screen.getByText('No ballots yet: wait for the phones, or enter the paper ballots.'),
    ).toBeTruthy();
  });

  it('takes the paper ballots by candidate, and closes the ballot', () => {
    render(
      <ElectionPanel
        state={{ ...base, currentElection: election({ votersWhoVoted: [3] }) }}
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

  describe('two seats', () => {
    const three = election({
      seats: 2,
      candidates: [
        { name: 'Alice Brennan', id: 3 },
        { name: 'Ben Whitaker', id: 4 },
        { name: 'Carl Moss', id: 5 },
      ],
      ballotResults: { 'Alice Brennan': 0, 'Ben Whitaker': 0, 'Carl Moss': 0 },
    });

    it('lets a phone choose up to two names, and casts them as one ballot', () => {
      render(
        <ElectionPanel
          state={{ ...base, currentElection: three }}
          dispatch={dispatch}
          currentUser={alice}
        />,
      );
      const ballot = screen.getByRole('group', { name: 'Your ballot' });
      expect(within(ballot).getByText('Choose up to 2')).toBeTruthy();
      const cast = within(ballot).getByRole('button', { name: 'Cast my ballot' });
      expect(cast.hasAttribute('disabled')).toBe(true);
      fireEvent.click(within(ballot).getByLabelText('Carl Moss'));
      fireEvent.click(within(ballot).getByLabelText('Alice Brennan'));
      // A third name can't be marked
      expect((within(ballot).getByLabelText('Ben Whitaker') as HTMLInputElement).disabled).toBe(
        true,
      );
      fireEvent.click(cast);
      expect(dispatch).toHaveBeenCalledWith({
        type: 'CAST_BALLOT',
        candidateNames: ['Alice Brennan', 'Carl Moss'],
        voterId: alice.id,
      });
    });

    it('takes the paper ballots: their number, marks, a name written in, blank and spoiled', () => {
      render(
        <ElectionPanel
          state={{ ...base, quorum: 1, currentElection: three }}
          dispatch={dispatch}
          currentUser={dana}
          isChair
        />,
      );
      const paper = screen.getByRole('form', { name: 'Paper ballots' });
      const fill = (label: string, value: string) =>
        fireEvent.change(within(paper).getByLabelText(label), { target: { value } });
      fill('Paper ballots counted, not counting blank ones', '15');
      fill('Alice Brennan in the room', '10');
      fill('Ben Whitaker in the room', '9');
      fill('Carl Moss in the room', '6');
      fireEvent.click(within(paper).getByRole('button', { name: 'Add a name written in' }));
      fill('Name written in', 'Dan Ortiz');
      fill('Votes', '1');
      fill('Blank ballots', '1');
      fill('Spoiled ballots', '1');
      fireEvent.click(within(paper).getByRole('button', { name: 'Enter the paper ballots' }));
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SET_FLOOR_BALLOTS',
          counts: { 'Alice Brennan': 10, 'Ben Whitaker': 9, 'Carl Moss': 6 },
          writeIns: { 'Dan Ortiz': 1 },
          blank: 1,
          illegal: 1,
          ballots: 15,
        }),
      );
    });

    it('declares each winner, then opens the next ballot for the seat still open', () => {
      const closed = {
        ...three,
        votingInProgress: false,
        ballotResults: { 'Alice Brennan': 14, 'Ben Whitaker': 12, 'Carl Moss': 8 },
        winners: ['Alice Brennan', 'Ben Whitaker'],
        elected: 'Alice Brennan',
      };
      const { unmount } = render(
        <ElectionPanel
          state={{ ...base, currentElection: closed }}
          dispatch={dispatch}
          currentUser={dana}
          isChair
        />,
      );
      expect(
        screen.getByText('Alice Brennan and Ben Whitaker have the vote required.'),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Declare Ben Whitaker elected' }));
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DECLARE_ELECTED', candidateName: 'Ben Whitaker' }),
      );
      unmount();

      const waiting = {
        ...closed,
        seats: 1,
        candidates: closed.candidates.slice(1),
        winners: [],
        elected: null,
      };
      render(
        <ElectionPanel
          state={{
            ...base,
            quorum: 1,
            currentElection: waiting,
            electedOfficers: [
              {
                position: 'Director',
                name: 'Alice Brennan',
                memberId: 3,
                electedAt: '',
                electionId: 7,
              },
            ],
          }}
          dispatch={dispatch}
          currentUser={dana}
          isChair
        />,
      );
      expect(
        screen.getByText(
          'Alice Brennan is elected. One seat is still open: Ben Whitaker, Carl Moss.',
        ),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Open the next ballot' }));
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'START_ELECTION',
          position: 'Director',
          requiredVotes: 'majority',
        }),
      );
    });
  });

  it('declares a lone nominee elected by acclamation, asking first without a quorum', () => {
    render(<ElectionPanel state={base} dispatch={dispatch} currentUser={dana} isChair />);
    fireEvent.click(screen.getByRole('button', { name: 'Declare elected by acclamation' }));
    // Some bylaws require a ballot even then: the chair confirms
    const confirm = screen.getByRole('group', { name: 'Declare elected by acclamation' });
    expect(
      within(confirm).getByText(
        'Declare Carmen Diaz elected without a ballot, if your bylaws allow it?',
      ),
    ).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Declare elected' }));
    expect(dispatch).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'There is no quorum' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Declare them elected anyway' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ELECT_BY_ACCLAMATION', confirmedWithoutQuorum: true }),
    );
  });
});
