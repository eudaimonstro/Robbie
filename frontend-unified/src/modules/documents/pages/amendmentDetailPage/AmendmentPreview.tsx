import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { amendments as amendmentsApi, type PreviewSection } from '../../../../api/client';

/**
 * The document as it would read if the amendment were adopted. Annotations, the members' notes,
 * are left out: the preview is the text, as the print is
 */
export function AmendmentPreview({ amendmentId }: { amendmentId: string }) {
  const [sections, setSections] = useState<PreviewSection[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let canceled = false;
    amendmentsApi
      .preview(amendmentId)
      .then((preview) => {
        if (!canceled) setSections(preview.sections);
      })
      .catch(() => {
        if (!canceled) setFailed(true);
      });
    return () => {
      canceled = true;
    };
  }, [amendmentId]);

  if (failed) return <p className="card p-6 text-ink-muted">Couldn&apos;t load the preview.</p>;
  if (!sections) return <p className="card p-6 text-ink-muted">Loading the preview...</p>;

  return (
    <div className="card p-4 sm:p-5">
      <p className="text-sm text-ink-muted">
        The document as it would read if this amendment were adopted: added sections are marked,
        removed ones struck through, and changed ones can show their old text.
      </p>
      {sections.length === 0 ? (
        <p className="mt-4 text-ink-muted">The document has no current version to preview.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {sections.map((section) => (
            <PreviewNode key={section.id} section={section} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Section text as the document page sets it, without the space after its last paragraph */
const CONTENT = 'document-content [&>:last-child]:mb-0';

function PreviewNode({ section, depth }: { section: PreviewSection; depth: number }) {
  const [showOld, setShowOld] = useState(false);
  const heading = [section.numberLabel, section.title].filter(Boolean).join(' ');
  const change = section.added
    ? 'added'
    : section.deleted
      ? 'removed'
      : section.modified
        ? 'changed'
        : null;
  const frame =
    change === 'added'
      ? 'border-carried bg-carried-tint'
      : change === 'removed'
        ? 'border-rule'
        : change === 'changed'
          ? 'border-gavel'
          : 'border-transparent';
  const old = section.previous;
  const oldHeading = old ? [old.numberLabel, old.title].filter(Boolean).join(' ') : '';

  return (
    <div className={depth > 0 ? 'ml-3 sm:ml-6' : ''}>
      <section
        aria-label={heading || 'Untitled section'}
        data-change={change ?? undefined}
        className={`rounded-lg border-l-4 p-3 ${frame}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {heading && (
            <span
              className={`font-document font-semibold ${depth === 0 ? 'text-lg' : ''} ${change === 'removed' ? 'text-ink-muted line-through' : 'text-ink'}`}
            >
              {heading}
            </span>
          )}
          {change === 'added' && <span className="badge-passed">Added</span>}
          {change === 'removed' && <span className="badge-withdrawn">Removed</span>}
          {change === 'changed' && <span className="badge-proposed">Changed</span>}
          {change === 'changed' && old && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              aria-expanded={showOld}
              onClick={() => setShowOld((shown) => !shown)}
            >
              {showOld ? 'Hide the old text' : 'Show the old text'}
            </button>
          )}
        </div>
        {section.content &&
          (change === 'removed' ? (
            <div className={`${CONTENT} mt-2 text-ink-muted line-through`}>
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
          ) : (
            <div className={`${CONTENT} mt-2`}>
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
          ))}
        {showOld && old && (
          <div className="mt-3 border-l-2 border-rule pl-3">
            <p className="label-caps">Before</p>
            {oldHeading && oldHeading !== heading && (
              <p className="mt-1 font-document text-ink-muted">{oldHeading}</p>
            )}
            {old.content && (
              <div className={`${CONTENT} mt-1 text-ink-muted`}>
                <ReactMarkdown>{old.content}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </section>
      {section.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {section.children.map((child) => (
            <PreviewNode key={child.id} section={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
