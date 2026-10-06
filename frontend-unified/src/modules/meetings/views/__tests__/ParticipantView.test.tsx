import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { ParticipantView } from '../ParticipantView';

const member: Member = { id: 2, name: 'Member', role: 'member', present: true };
const base: MeetingState = {
  ...initialState,
  meetingActive: true,
  agendaAdopted: true,
  members: [{ id: 1, name: 'Chair', role: 'chair', present: true }, member],
};

describe('ParticipantView elections', () => {
  it('lets a member nominate while nominations are open', () => {
    const state = { ...base, nominationsOpen: true, currentNominationPosition: 'Treasurer' };
    render(<ParticipantView state={state} dispatch={vi.fn()} currentUser={member} />);
    expect(screen.queryByPlaceholderText('Name of nominee')).not.toBeNull();
  });

  it('lets a member cast a ballot in an election', () => {
    const state: MeetingState = {
      ...base,
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
    };
    render(<ParticipantView state={state} dispatch={vi.fn()} currentUser={member} />);
    expect(screen.queryByRole('button', { name: 'Vote for Alice' })).not.toBeNull();
  });
});
