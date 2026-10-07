import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member, ProxyVoteRecord } from '@robbie-bylawyer/shared/types';
import { VotingPanel } from '../VotingPanel';

const holder = { id: 2, name: 'Member 2', role: 'member', present: true } as Member;

function holdingProxy(proxyVotes: ProxyVoteRecord[]): MeetingState {
  return {
    ...initialState,
    meetingActive: true,
    votingOpen: true,
    votingMethod: 'ballot',
    allowProxyVoting: true,
    members: [holder, { id: 3, name: 'Member 3', role: 'member', present: false } as Member],
    proxies: [
      {
        id: 1,
        grantedBy: 3,
        grantedTo: 2,
        grantedByName: 'Member 3',
        grantedToName: 'Member 2',
        grantedAt: '',
        scope: 'all',
      },
    ],
    proxyVotes,
  };
}

describe('participant VotingPanel', () => {
  it("shows a proxy vote as recorded on a secret ballot, where the choice isn't sent", () => {
    render(
      <VotingPanel
        state={holdingProxy([{ memberId: 3, castBy: 2 }])}
        dispatch={vi.fn()}
        currentUser={holder}
        hasQuorum
        presentCount={1}
      />,
    );

    expect(screen.queryByText('✓ Proxy vote recorded')).not.toBeNull();
    // No choice is shown, since none is known
    expect(screen.getByRole('button', { name: 'Vote YEA for Member 3' }).textContent).toBe('YEA');
  });

  it('shows no proxy vote recorded before one is cast', () => {
    render(
      <VotingPanel
        state={holdingProxy([])}
        dispatch={vi.fn()}
        currentUser={holder}
        hasQuorum
        presentCount={1}
      />,
    );

    expect(screen.queryByText('Member 3')).not.toBeNull();
    expect(screen.queryByText('✓ Proxy vote recorded')).toBeNull();
  });
});
