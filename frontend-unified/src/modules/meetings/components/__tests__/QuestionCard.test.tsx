import { describe, it, expect } from 'vitest';
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
