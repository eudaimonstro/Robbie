import type { BylawChangeView, SectionText } from '@robbie-bylawyer/shared/utils';

interface BylawTextProps {
  text: BylawChangeView;
  size: 'laptop' | 'phone' | 'display';
}

/** A section's text on the display: past this many characters it drops to the smaller size */
const DISPLAY_LONG = 400;
/** Past this many, the display can't show it all: the phones and the console can */
const DISPLAY_TOO_LONG = 900;

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
 * The bylaw text a motion puts before the meeting, under the question: the section, the text as
 * it reads now and as it would read (or what is struck out, added or renumbered). On the console
 * and the phones it scrolls; on the display, which nobody touches, it shows the new text large
 * and says where to read the rest when it is too long for the screen.
 */
export function BylawText({ text, size }: BylawTextProps) {
  const labels = labelsFor(text);

  if (size === 'display') {
    const shown = text.proposed ?? text.current;
    const words = shown?.text ?? '';
    return (
      <section aria-label="The text" className="space-y-3 border-l-4 border-gavel pl-6">
        <p className="text-display-label font-semibold uppercase tracking-[0.08em] text-ink-muted">
          {text.heading}: {text.action}
        </p>
        {shown?.title && (
          <p className="font-serif-soft text-display-line font-semibold text-ink">{shown.title}</p>
        )}
        {words && (
          <p
            className={`whitespace-pre-line text-ink ${
              words.length > DISPLAY_LONG
                ? 'line-clamp-[9] text-display-label'
                : 'line-clamp-5 text-display-line'
            }`}
          >
            {words}
          </p>
        )}
        {words.length > DISPLAY_TOO_LONG && (
          <p className="text-display-label text-ink-muted">The full text is on your phone.</p>
        )}
      </section>
    );
  }

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
        {text.current && (
          <Section label={labels.current} section={text.current} muted={!!text.proposed} />
        )}
        {text.proposed && <Section label={labels.proposed} section={text.proposed} />}
        {!text.current && !text.proposed && <p className="text-ink">{text.action}</p>}
      </div>
    </section>
  );
}
