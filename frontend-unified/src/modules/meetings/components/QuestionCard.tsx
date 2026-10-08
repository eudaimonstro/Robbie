import type { ReactNode } from 'react';
import type { QuestionView } from '../utils/question';
import { BylawText } from './BylawText';

interface QuestionCardProps {
  question: QuestionView | null;
  /** 2.5rem on a laptop, 1.5rem on a phone, 72px on the display */
  size?: 'laptop' | 'phone' | 'display';
  /** What to say when nothing is pending */
  empty?: string;
  /** The chair's toolbar and script line, under the question */
  children?: ReactNode;
}

const TEXT_SIZE = {
  laptop: 'text-question',
  phone: 'text-question-phone',
  display: 'text-display-question',
} as const;

/**
 * The question card (docs/design-brief.md): whatever is pending, always shown the same way, in
 * the serif, with who moved and seconded it and the vote it needs. It crossfades when the
 * question changes and never slides.
 */
export function QuestionCard({
  question,
  size = 'laptop',
  empty = 'No question is pending.',
  children,
}: QuestionCardProps) {
  const display = size === 'display';
  const label = display
    ? 'text-display-label font-semibold uppercase tracking-[0.08em] text-ink-muted'
    : 'label-caps';
  const secondary = display ? 'text-display-line text-ink-muted' : 'text-ink-muted';
  // On the display, a bylaw amendment's text needs the room: the question steps down a size
  const textSize = display && question?.bylawText ? 'text-display-line' : TEXT_SIZE[size];

  return (
    <section
      aria-label="The question"
      className={display ? 'flex min-h-0 flex-col' : 'card border-t-2 border-t-gavel p-5 sm:p-6'}
    >
      {question ? (
        <div
          key={question.key}
          className={`animate-crossfade ${display ? 'flex min-h-0 flex-col gap-3' : 'space-y-3'}`}
        >
          <p className={label}>{question.kind}</p>
          <p className={`font-serif-soft font-semibold text-ink ${textSize}`}>{question.text}</p>
          {question.byline && <p className={secondary}>{question.byline}</p>}
          {(question.requirement || question.awaitingSecond) && (
            <div className="flex flex-wrap items-center gap-2">
              {question.requirement &&
                (display ? (
                  <p className={label}>{question.requirement}</p>
                ) : (
                  <span className="badge">{question.requirement}</span>
                ))}
              {question.awaitingSecond && <span className="badge-proposed">Awaiting a second</span>}
            </div>
          )}
          {question.bylawText && <BylawText text={question.bylawText} size={size} />}
          {question.beneath.length > 0 && (
            <div>
              <p className={label}>Pending beneath it</p>
              <ul
                className={`mt-1 space-y-1 ${display ? 'text-display-label text-ink-muted' : 'text-sm text-ink-muted'}`}
              >
                {question.beneath.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className={secondary}>{empty}</p>
      )}
      {children}
    </section>
  );
}
