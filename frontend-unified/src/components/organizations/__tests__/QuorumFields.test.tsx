import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { QuorumFields } from '../QuorumFields';
import { quorumDraftOf, readQuorumDraft, type QuorumDraft } from '../quorumDraft';

describe('readQuorumDraft', () => {
  it('reads the voting members and a percentage or a count', () => {
    expect(readQuorumDraft({ voters: ' 142 ', kind: 'percent', quorum: '20' })).toEqual({
      body: { eligibleVoters: 142, quorumPercent: 20 },
    });
    expect(readQuorumDraft({ voters: '142', kind: 'count', quorum: '29' })).toEqual({
      body: { eligibleVoters: 142, quorumCount: 29 },
    });
  });

  it('says what is wrong, in words', () => {
    expect(readQuorumDraft({ voters: '', kind: 'percent', quorum: '20' })).toEqual({
      problem: 'Give the number of voting members: a whole number, 1 or more',
    });
    expect(readQuorumDraft({ voters: '142', kind: 'percent', quorum: '120' })).toEqual({
      problem: 'The quorum is a percentage from 1 to 100',
    });
    expect(readQuorumDraft({ voters: '142', kind: 'count', quorum: '2.5' })).toEqual({
      problem: 'The quorum is a whole number of people, 1 or more',
    });
    expect(readQuorumDraft({ voters: '10', kind: 'count', quorum: '12' })).toEqual({
      problem: "The quorum can't be more people than the voting members",
    });
  });
});

describe('quorumDraftOf', () => {
  it('starts empty, as a percentage, with nothing guessed', () => {
    expect(quorumDraftOf(null)).toEqual({ voters: '', kind: 'percent', quorum: '' });
    // The old default of 3 people, with no voting members, was never chosen
    expect(quorumDraftOf({ eligibleVoters: null, quorumPercent: null, quorumCount: 3 })).toEqual({
      voters: '',
      kind: 'percent',
      quorum: '',
    });
  });

  it('shows settings as they are', () => {
    expect(quorumDraftOf({ eligibleVoters: 142, quorumPercent: 20, quorumCount: null })).toEqual({
      voters: '142',
      kind: 'percent',
      quorum: '20',
    });
    expect(quorumDraftOf({ eligibleVoters: 40, quorumPercent: null, quorumCount: 10 })).toEqual({
      voters: '40',
      kind: 'count',
      quorum: '10',
    });
  });
});

function Harness({ onChange }: { onChange: (draft: QuorumDraft) => void }) {
  const [draft, setDraft] = useState(quorumDraftOf(null));
  return (
    <QuorumFields
      value={draft}
      onChange={(next) => {
        setDraft(next);
        onChange(next);
      }}
    />
  );
}

describe('QuorumFields', () => {
  it('says what a percentage comes to in people', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Voting members'), { target: { value: '142' } });
    fireEvent.change(screen.getByLabelText('Quorum percentage'), { target: { value: '20' } });
    expect(screen.getByText('%, which is 29 people')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('A number of people'));
    expect(screen.getByLabelText('Quorum count')).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith({ voters: '142', kind: 'count', quorum: '20' });
  });
});
