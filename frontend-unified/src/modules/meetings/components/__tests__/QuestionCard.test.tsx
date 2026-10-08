import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { QuestionView } from '../../utils/question';
import { QuestionCard } from '../QuestionCard';

const question: QuestionView = {
  kind: 'Main Motion',
  text: 'Resurface the pool this spring',
  byline: 'Moved by Alice Brennan, seconded by Ben Whitaker',
  requirement: 'Majority',
  awaitingSecond: false,
  beneath: [],
  key: 'motion-1',
};

describe('QuestionCard', () => {
  it('shows the kind, the question, who moved and seconded it, and the vote it needs', () => {
    render(<QuestionCard question={question} />);
    const card = screen.getByRole('region', { name: 'The question' });
    expect(card.textContent).toContain('Main Motion');
    expect(screen.getByText('Resurface the pool this spring').className).toContain('text-question');
    expect(screen.getByText('Moved by Alice Brennan, seconded by Ben Whitaker')).toBeTruthy();
    expect(screen.getByText('Majority')).toBeTruthy();
  });

  it('says a motion awaits a second, and what is pending beneath it', () => {
    render(
      <QuestionCard
        question={{ ...question, awaitingSecond: true, beneath: ['Main Motion: Buy a mower'] }}
      />,
    );
    expect(screen.getByText('Awaiting a second')).toBeTruthy();
    expect(screen.getByText('Main Motion: Buy a mower')).toBeTruthy();
  });

  it('is 72px on the display and 1.5rem on a phone', () => {
    const { unmount } = render(<QuestionCard question={question} size="display" />);
    expect(screen.getByText(question.text).className).toContain('text-display-question');
    unmount();
    render(<QuestionCard question={question} size="phone" />);
    expect(screen.getByText(question.text).className).toContain('text-question-phone');
  });

  describe('with a bylaw amendment', () => {
    const bylaw: QuestionView = {
      ...question,
      kind: 'Bylaw Amendment',
      text: 'I move to amend the bylaws by modifying Section 4.2 "Quorum"',
      bylawText: {
        heading: 'Section 4.2 "Quorum"',
        action: 'To read',
        current: { title: 'Quorum', text: 'Twenty percent is a quorum.' },
        proposed: { title: 'Quorum', text: 'Fifteen percent is a quorum.' },
      },
    };

    it('shows the section as it reads now and as it would read, on the console and the phone', () => {
      for (const size of ['laptop', 'phone'] as const) {
        const { unmount } = render(<QuestionCard question={bylaw} size={size} />);
        const text = screen.getByRole('region', { name: 'The text' });
        expect(text.textContent).toContain('Section 4.2 "Quorum"');
        expect(text.textContent).toContain('Now reads');
        expect(text.textContent).toContain('Twenty percent is a quorum.');
        expect(text.textContent).toContain('Would read');
        expect(text.textContent).toContain('Fifteen percent is a quorum.');
        unmount();
      }
    });

    it('folds the current text away on the console, and shows it on the phone', () => {
      const { unmount } = render(<QuestionCard question={bylaw} size="laptop" />);
      const fold = screen.getByText('Show the current text').closest('details');
      expect(fold?.open).toBe(false);
      expect(fold?.textContent).toContain('Twenty percent is a quorum.');
      unmount();
      render(<QuestionCard question={bylaw} size="phone" />);
      expect(screen.queryByText('Show the current text')).toBeNull();
    });

    it('steps the question down on the display to make room for the new text', () => {
      render(<QuestionCard question={bylaw} size="display" />);
      expect(screen.getByText(bylaw.text).className).toContain('text-display-line');
      expect(screen.getByText('Section 4.2 "Quorum": To read')).toBeTruthy();
      expect(screen.getByText('Fifteen percent is a quorum.').className).toContain(
        'text-display-label',
      );
      expect(screen.queryByText('Twenty percent is a quorum.')).toBeNull();
      // It fits: nothing points to the phones
      expect(screen.queryByText('The full text is on your phone.')).toBeNull();
    });

    it('says where to read the rest whenever the display cuts the text', () => {
      // The text box measures taller than the room it has, however long the text
      const scroll = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(900);
      const client = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
      try {
        render(<QuestionCard question={bylaw} size="display" />);
        expect(screen.getByText('The full text is on your phone.')).toBeTruthy();
      } finally {
        scroll.mockRestore();
        client.mockRestore();
      }
    });

    it('says what is struck out', () => {
      render(
        <QuestionCard
          question={{
            ...bylaw,
            bylawText: { ...bylaw.bylawText!, action: 'To strike out', proposed: null },
          }}
        />,
      );
      expect(screen.getByRole('region', { name: 'The text' }).textContent).toContain(
        'To strike outQuorumTwenty percent is a quorum.',
      );
    });
  });

  it('says so when nothing is pending, and carries the chair toolbar', () => {
    render(
      <QuestionCard question={null} empty="The floor is open.">
        <button type="button">Adjourn</button>
      </QuestionCard>,
    );
    expect(screen.getByText('The floor is open.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Adjourn' })).toBeTruthy();
  });
});
