import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { VotingPanel } from '../VotingPanel';

const member = (id: number, role: Member['role']): Member =>
  ({ id, name: `Member ${id}`, role, present: true }) as Member;

function votingState(members: Member[]): MeetingState {
  return {
    ...initialState,
    meetingActive: true,
    votingOpen: true,
    members,
    votes: { yea: 1, nay: 0, abstain: 0 },
    voters: [members[0].id],
  };
}

describe('chair VotingPanel', () => {
  it('lets an admin presiding without a chair close the vote', () => {
    const dispatch = vi.fn();
    render(
      <VotingPanel
        state={votingState([member(1, 'admin'), member(2, 'member')])}
        dispatch={dispatch}
        hasQuorum
        presentCount={2}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close & Announce' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'CLOSE_VOTING' }));
  });

  it('offers the chair a deciding vote on a tie', () => {
    const state = votingState([member(1, 'chair'), member(2, 'member'), member(3, 'member')]);
    render(
      <VotingPanel
        state={{ ...state, votes: { yea: 1, nay: 1, abstain: 0 }, voters: [2, 3] }}
        dispatch={vi.fn()}
        hasQuorum
        presentCount={3}
      />,
    );

    expect(screen.queryByText('Chair may vote to break the tie')).not.toBeNull();
  });

  it('offers no deciding vote before anyone has voted', () => {
    const state = votingState([member(1, 'chair'), member(2, 'member')]);
    render(
      <VotingPanel
        state={{ ...state, votes: { yea: 0, nay: 0, abstain: 0 }, voters: [] }}
        dispatch={vi.fn()}
        hasQuorum
        presentCount={2}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Vote Yea' })).toBeNull();
  });

  it('lets the chair vote on a secret ballot', () => {
    const dispatch = vi.fn();
    const state = votingState([member(1, 'chair'), member(2, 'member')]);
    render(
      <VotingPanel
        state={{ ...state, votingMethod: 'ballot', voters: [2] }}
        dispatch={dispatch}
        hasQuorum
        presentCount={2}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Vote Nay' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CAST_VOTE', vote: 'nay', voterId: 1 }),
    );
  });
});
