import { useLayoutEffect, useRef, useState } from 'react';
import type { BylawChangeView, SectionText } from '@robbie-bylawyer/shared/utils';

interface BylawTextProps {
  text: BylawChangeView;
  size: 'laptop' | 'phone' | 'display';
}

/** The labels over the two texts: what the section says now, and what it would say */
function labelsFor(text: BylawChangeView): { current: string; proposed: string } {
  switch (text.action) {
    case 'To read':
      return { current: 'Now reads', proposed: 'Would read' };
    case 'To add':
      return { current: '', proposed: 'To add' };
    default:
      return { current: text.action, proposed: text.action };
  }
}

function Section({
  label,
  section,
  muted,
}: {
  label: string;
  section: SectionText;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="label-caps">{label}</p>
      {section.title && <p className="mt-1 font-semibold text-ink">{section.title}</p>}
      {section.text && (
        <p className={`mt-1 whitespace-pre-line ${muted ? 'text-ink-muted' : 'text-ink'}`}>
          {section.text}
        </p>
      )}
    </div>
  );
}

/**
 * Whether an element's content is taller than the element: measured, so it holds for any text,
 * line breaks and screen, and again whenever the element is resized
 */
function useOverflowing<T extends HTMLElement>(content: unknown) {
  const ref = useRef<T>(null);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [content]);
  return [ref, overflowing] as const;
}

/**
 * The text on the display, which nobody touches: the section and its new text (or the text
 * struck out), taking what room the screen has left under the question and cut where it runs
 * out, with a line saying where to read the rest
 */
function DisplayText({ text }: { text: BylawChangeView }) {
  const shown = text.proposed ?? text.current;
  const [body, clamped] = useOverflowing<HTMLDivElement>(shown);
  return (
    <section
      aria-label="The text"
      className="flex min-h-0 flex-col gap-3 border-l-4 border-gavel pl-6"
    >
      <p className="shrink-0 text-display-label font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {text.heading}: {text.action}
      </p>
      {shown && (
        <div
          ref={body}
          // Cut text fades out rather than ending mid-line
          className={`min-h-0 space-y-2 overflow-hidden ${
            clamped ? '[mask-image:linear-gradient(to_bottom,black_75%,transparent)]' : ''
          }`}
        >
          {shown.title && (
            <p className="font-serif-soft text-display-label font-semibold text-ink">
              {shown.title}
            </p>
          )}
          {shown.text && (
            <p className="whitespace-pre-line text-display-label text-ink">{shown.text}</p>
          )}
        </div>
      )}
      {clamped && (
        <p className="shrink-0 text-display-label text-ink-muted">
          The full text is on your phone.
        </p>
      )}
    </section>
  );
}

/**
 * The bylaw text a motion puts before the meeting, under the question: the section, the text as
 * it reads now and as it would read (or what is struck out, added or renumbered). On the console
 * and the phones it scrolls; on the display it fills the room left and says where to read the
 * rest.
 */
export function BylawText({ text, size }: BylawTextProps) {
  if (size === 'display') return <DisplayText text={text} />;

  const labels = labelsFor(text);
  return (
    <section aria-label="The text" className="rounded-lg border border-rule bg-surface-2 p-4">
      <p className="label-caps">The text</p>
      <p className="mt-1 font-semibold text-ink">{text.heading}</p>
      <div
        // Scrolls when long, so it takes the keyboard too
        tabIndex={0}
        role="group"
        aria-label={`The text of ${text.heading}`}
        className={`mt-3 space-y-4 overflow-y-auto pr-1 ${size === 'phone' ? 'max-h-80' : 'max-h-96'}`}
      >
        {text.current &&
          // On the console the current text folds away, so the chair's toolbar stays near the
          // question; the phones show it
          (size === 'laptop' && text.proposed ? (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-gavel">
                Show the current text
              </summary>
              <div className="mt-2">
                <Section label={labels.current} section={text.current} muted />
              </div>
            </details>
          ) : (
            <Section label={labels.current} section={text.current} muted={!!text.proposed} />
          ))}
        {text.proposed && <Section label={labels.proposed} section={text.proposed} />}
        {!text.current && !text.proposed && <p className="text-ink">{text.action}</p>}
      </div>
    </section>
  );
}
