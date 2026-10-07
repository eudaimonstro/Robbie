import { useEffect, useRef } from 'react';
import type { StampOutcome } from '../utils/question';

interface StampProps {
  outcome: StampOutcome;
  /** What was decided: the motion, or who was elected to what */
  subject?: string | null;
  /** "On devices 12 to 3, in the room 9 to 2: 21 to 5" */
  tally?: string | null;
  /** In a console panel, on a phone, or filling a third of the display */
  size?: 'panel' | 'phone' | 'display';
}

const WORDS: Record<StampOutcome, string> = {
  carried: 'Carried',
  failed: 'Failed',
  elected: 'Elected',
  adopted: 'Adopted',
};

const SIZES = {
  panel: { gap: 'gap-4', word: 'text-5xl px-6 py-2', subject: 'text-lg', tally: 'text-base' },
  phone: { gap: 'gap-4', word: 'text-4xl px-5 py-1.5', subject: 'text-base', tally: 'text-sm' },
  display: {
    // The tilt drops the wide box's corners about 30px, so the caption sits further below
    gap: 'gap-14',
    word: 'text-[10rem] leading-none px-12 py-6',
    subject: 'text-display-line',
    tally: 'text-display-line',
  },
} as const;

/**
 * The stamp (docs/design-brief.md), the only theater in the app: the result in Fraunces 700,
 * uppercase, in a 3px border, tilted -4 degrees, landing with a short scale and fade. Carried,
 * adopted (by unanimous consent) and elected are in the carried color; failed is ink, never red.
 */
export function Stamp({ outcome, subject, tally, size = 'panel' }: StampProps) {
  const sizes = SIZES[size];
  const color = outcome === 'failed' ? 'border-ink text-ink' : 'border-carried text-carried';
  const label = tally ? `${WORDS[outcome]}, ${tally}` : WORDS[outcome];
  const spoken = [WORDS[outcome], subject, tally].filter(Boolean).join(', ');
  const liveRef = useRef<HTMLSpanElement>(null);

  // Read out by a screen reader: the live region is on the page, empty, before the result is
  // written into it (a region that arrives with its words is often not read)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (liveRef.current) liveRef.current.textContent = spoken;
    }, 150);
    return () => clearTimeout(timer);
  }, [spoken]);

  return (
    <figure aria-label={label} className={`flex flex-col items-center text-center ${sizes.gap}`}>
      <span ref={liveRef} role="status" className="sr-only" />
      <span
        className={`animate-stamp -rotate-4 inline-block rounded-md border-[3px] font-serif-soft font-bold uppercase tracking-[0.06em] ${color} ${sizes.word}`}
      >
        {WORDS[outcome]}
      </span>
      {(subject || tally) && (
        <figcaption className="space-y-1">
          {subject && <p className={`font-serif-soft text-ink ${sizes.subject}`}>{subject}</p>}
          {tally && <p className={`tabular-nums text-ink-muted ${sizes.tally}`}>{tally}</p>}
        </figcaption>
      )}
    </figure>
  );
}
