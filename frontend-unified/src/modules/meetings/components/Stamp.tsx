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
};

const SIZES = {
  panel: { word: 'text-5xl px-6 py-2', subject: 'text-lg', tally: 'text-base' },
  phone: { word: 'text-4xl px-5 py-1.5', subject: 'text-base', tally: 'text-sm' },
  display: {
    word: 'text-[10rem] leading-none px-12 py-6',
    subject: 'text-display-line',
    tally: 'text-display-line',
  },
} as const;

/**
 * The stamp (docs/design-brief.md), the only theater in the app: the result in Fraunces 700,
 * uppercase, in a 3px border, tilted -4 degrees, landing with a short scale and fade. Carried and
 * elected are in the carried color; failed is ink, never red.
 */
export function Stamp({ outcome, subject, tally, size = 'panel' }: StampProps) {
  const sizes = SIZES[size];
  const color = outcome === 'failed' ? 'border-ink text-ink' : 'border-carried text-carried';
  return (
    <figure
      role="status"
      aria-label={tally ? `${WORDS[outcome]}, ${tally}` : WORDS[outcome]}
      className="flex flex-col items-center gap-4 text-center"
    >
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
