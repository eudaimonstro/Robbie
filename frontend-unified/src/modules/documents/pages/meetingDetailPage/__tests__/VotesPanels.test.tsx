import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecordedVotesPanel } from '../VotesPanels';
import type { Vote } from '../../../../../api/client';

const vote = (overrides: Partial<Vote>): Vote => ({
  id: 'vote-1',
  meetingId: 'meeting-1',
  amendmentId: 'amendment-1',
  yeaCount: 8,
  nayCount: 3,
  abstainCount: 1,
  result: 'passed',
  recordedAt: '2026-10-05T12:00:00.000Z',
  ...overrides,
});

function renderVotes(votes: Vote[]) {
  render(
    <RecordedVotesPanel
      votes={votes}
      getAmendmentTitle={() => 'Add a treasurer'}
      getDocumentTitle={() => 'Bylaws'}
    />,
  );
}

describe('RecordedVotesPanel', () => {
  it('shows a passed vote as Passed', () => {
    renderVotes([vote({ result: 'passed' })]);
    expect(screen.getByText('Passed')).toBeTruthy();
    expect(screen.queryByText('Failed')).toBeNull();
  });

  it('shows a failed vote as Failed', () => {
    renderVotes([vote({ result: 'failed', yeaCount: 2, nayCount: 9 })]);
    expect(screen.getByText('Failed')).toBeTruthy();
  });
});
