import { Fragment } from 'react';
import { wordDiff } from '../../../utils/wordDiff';

/**
 * Old and new text as one paragraph, the changed words marked: the old struck through in muted
 * ink, the new underlined on the carried tint (no red: the brief keeps it for the gavel). A
 * screen reader hears "removed" and "added" before each, since few read the marks out.
 */
export function WordDiff({ before, after }: { before: string; after: string }) {
  const parts = wordDiff(before, after);
  return (
    <p className="whitespace-pre-wrap font-document leading-relaxed text-ink">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part.kind === 'same' ? (
            part.text
          ) : part.kind === 'removed' ? (
            <del className="text-ink-muted line-through decoration-ink">
              <span className="sr-only">Removed: </span>
              {part.text}
            </del>
          ) : (
            <ins className="rounded-sm bg-carried-tint px-0.5 text-ink underline decoration-carried decoration-2 underline-offset-2">
              <span className="sr-only">Added: </span>
              {part.text}
            </ins>
          )}
          {/* The old words and the new side by side, apart */}
          {part.kind === 'removed' && parts[i + 1]?.kind === 'added' ? ' ' : null}
        </Fragment>
      ))}
    </p>
  );
}
