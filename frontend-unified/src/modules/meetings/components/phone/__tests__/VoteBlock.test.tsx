import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { VoteBlock } from '../VoteBlock';

const me: Member = { id: 2, name: 'Ann', role: 'member', present: true, presentBy: 'device' };
const open: MeetingState = { ...initialState, meetingActive: true, votingOpen: true };

/** A dispatch the test answers when it chooses */
function answeredLater() {
  let answer: (sent: boolean) => void = () => {};
  const dispatch = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        answer = resolve;
      }),
  );
  return { dispatch, answer: (sent: boolean) => act(async () => answer(sent)) };
}

afterEach(cleanup);

describe('VoteBlock', () => {
  it('shows a tapped vote as sending until the server answers, then as tapped', async () => {
    const { dispatch, answer } = answeredLater();
    const { rerender } = render(<VoteBlock state={open} dispatch={dispatch} me={me} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vote yea' }));
    expect(screen.getByRole('status').textContent).toBe('Sending your vote...');
    expect(screen.getByRole('button', { name: 'Vote yea' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Vote yea' }).getAttribute('aria-busy')).toBe('true');

    await answer(true);
    expect(screen.queryByText('Sending your vote...')).toBeNull();
    // Still shown as tapped while the update with it is on the way
    expect(screen.getByRole('button', { name: 'Vote yea' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    rerender(
      <VoteBlock
        state={{ ...open, voters: [2], voterChoices: { 2: 'yea' } }}
        dispatch={dispatch}
        me={me}
      />,
    );
    expect(screen.getByRole('status').textContent).toMatch(/^Vote recorded/);
  });

  it('says a vote was not sent, and sends it again on request', async () => {
    const { dispatch, answer } = answeredLater();
    render(<VoteBlock state={open} dispatch={dispatch} me={me} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vote nay' }));
    await answer(false);

    expect(screen.getByRole('alert').textContent).toContain('Your vote was not sent.');
    expect(screen.getByRole('button', { name: 'Vote nay' }).getAttribute('aria-pressed')).toBe(
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send again' }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'CAST_VOTE', vote: 'nay', voterId: 2 });
    expect(screen.getByRole('status').textContent).toBe('Sending your vote...');
  });

  it('shows the latest tap while an earlier one is answered', async () => {
    const answers: Array<(sent: boolean) => void> = [];
    const dispatch = vi.fn(() => new Promise<boolean>((resolve) => answers.push(resolve)));
    render(<VoteBlock state={open} dispatch={dispatch} me={me} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vote yea' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vote nay' }));
    await act(async () => answers[0](false));

    // The yea that failed is not shown: the nay is still on its way
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Sending your vote...');
    expect(screen.getByRole('button', { name: 'Vote nay' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('takes back "not sent" once the meeting shows the vote cast', async () => {
    const { dispatch, answer } = answeredLater();
    const { rerender } = render(<VoteBlock state={open} dispatch={dispatch} me={me} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vote yea' }));
    await answer(false);
    expect(screen.getByRole('alert')).toBeTruthy();

    rerender(
      <VoteBlock
        state={{ ...open, voters: [2], voterChoices: { 2: 'yea' } }}
        dispatch={dispatch}
        me={me}
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('never shows the choice on a secret ballot, even while it is sent', () => {
    const { dispatch } = answeredLater();
    render(<VoteBlock state={{ ...open, votingMethod: 'ballot' }} dispatch={dispatch} me={me} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vote yea' }));
    expect(screen.getByRole('status').textContent).toBe('Sending your vote...');
    expect(screen.getByRole('button', { name: 'Vote yea' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});
