import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { amendments as amendmentsApi, type PreviewSection } from '../../../../api/client';
import { scrollBehavior } from '../../../../utils/motion';
import { WordDiff } from '../../components/WordDiff';

type Change = 'changed' | 'removed' | 'added';

function changeOf(section: PreviewSection): Change | null {
  if (section.added) return 'added';
  if (section.deleted) return 'removed';
  if (section.modified) return 'changed';
  return null;
}

/** The sections the amendment touches, by kind, in the document's order */
function sectionsByChange(sections: PreviewSection[]): Record<Change, PreviewSection[]> {
  const found: Record<Change, PreviewSection[]> = { changed: [], removed: [], added: [] };
  const visit = (section: PreviewSection) => {
    const change = changeOf(section);
    if (change) found[change].push(section);
    section.children.forEach(visit);
  };
  sections.forEach(visit);
  return found;
}

/** The anchor of a section, as the document page's (#section-<id>) */
const anchorOf = (section: PreviewSection) => `section-${section.id}`;

/**
 * The document as it would read if the amendment were adopted. Annotations, the members' notes,
 * are left out: the preview is the text, as the print is
 */
export function AmendmentPreview({ amendmentId }: { amendmentId: string }) {
  const [sections, setSections] = useState<PreviewSection[] | null>(null);
  // Sections it changes that the current version no longer has, by label
  const [missing, setMissing] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let canceled = false;
    amendmentsApi
      .preview(amendmentId)
      .then((preview) => {
        if (!canceled) {
          setSections(preview.sections);
          setMissing(preview.missing ?? []);
        }
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
      <ChangeSummary sections={sections} quiet={missing.length > 0} />
      {missing.length > 0 && (
        <p className="mt-2 rounded-sm bg-caution-tint px-3 py-2 text-sm text-caution-ink">
          No longer in the bylaws, so not shown here: {missing.join(', ')}.
        </p>
      )}
      <p className="mt-2 text-sm text-ink-muted">
        The document as it would read if this amendment were adopted: added sections are marked,
        removed ones struck through, and changed ones can show the words that change.
      </p>
      {sections.length === 0 ? (
        <p className="mt-4 text-ink-muted">The document has no current version to preview.</p>
      ) : (
        // A readable measure, as the document page's: the page is wider than a line of text
        <div className="mt-4 max-w-3xl space-y-2">
          {sections.map((section) => (
            <PreviewNode key={section.id} section={section} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * What the amendment does, in a line ("1 changed (Section 4.2), 1 removed (Section 6), 1 added
 * (Section 7)"), each section a link that brings it into view
 */
function ChangeSummary({ sections, quiet }: { sections: PreviewSection[]; quiet: boolean }) {
  const found = sectionsByChange(sections);
  const groups = (['changed', 'removed', 'added'] as const).filter(
    (change) => found[change].length > 0,
  );
  if (groups.length === 0) {
    // With changes to sections no longer in the bylaws, they say what there is
    return quiet ? null : <p className="font-medium text-ink">No changes yet.</p>;
  }

  const jumpTo = (section: PreviewSection) => {
    const target = document.getElementById(anchorOf(section));
    target?.scrollIntoView?.({ behavior: scrollBehavior(), block: 'start' });
    // Keyboard and screen reader users land on the section too
    target?.focus({ preventScroll: true });
  };

  return (
    <nav aria-label="The changes">
      <p className="text-ink">
        {groups.map((change, g) => (
          <span key={change}>
            {g > 0 && ', '}
            <span className="font-medium">
              {found[change].length} {change}
            </span>
            {' ('}
            {found[change].map((section, i) => (
              <span key={section.id}>
                {i > 0 && ', '}
                <a
                  href={`#${anchorOf(section)}`}
                  className="text-gavel underline underline-offset-2 hover:decoration-2"
                  onClick={(event) => {
                    event.preventDefault();
                    jumpTo(section);
                  }}
                >
                  {section.numberLabel || section.title || 'Untitled section'}
                </a>
              </span>
            ))}
            {')'}
          </span>
        ))}
      </p>
    </nav>
  );
}

/** Section text as the document page sets it, without the space after its last paragraph */
const CONTENT = 'document-content [&>:last-child]:mb-0';

function PreviewNode({ section, depth }: { section: PreviewSection; depth: number }) {
  // A changed section shows its new text, or the words that change, old and new in one
  const [showChanges, setShowChanges] = useState(false);
  const heading = [section.numberLabel, section.title].filter(Boolean).join(' ');
  const change = changeOf(section);
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
        id={anchorOf(section)}
        tabIndex={-1}
        aria-label={heading || 'Untitled section'}
        data-change={change ?? undefined}
        className={`scroll-mt-4 rounded-lg border-l-4 p-3 focus:outline-none ${frame}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {heading && (
            <span
              className={`font-document font-semibold ${depth === 0 ? 'text-lg' : ''} ${change === 'removed' ? 'text-ink-muted line-through' : 'text-ink'}`}
            >
              {heading}
            </span>
          )}
          {/* Solid, not the passed badge's tint: the section around it is already that tint */}
          {change === 'added' && <span className="badge bg-carried text-paper">Added</span>}
          {change === 'removed' && <span className="badge-withdrawn">Removed</span>}
          {change === 'changed' && <span className="badge-proposed">Changed</span>}
          {change === 'changed' && old && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              aria-pressed={showChanges}
              onClick={() => setShowChanges((shown) => !shown)}
            >
              {showChanges ? 'Show the new text' : 'Show what changed'}
            </button>
          )}
        </div>
        {showChanges && old ? (
          <div className="mt-2 space-y-1">
            {oldHeading !== heading && (
              <div className="text-sm">
                <WordDiff before={oldHeading} after={heading} />
              </div>
            )}
            <WordDiff before={old.content ?? ''} after={section.content ?? ''} />
          </div>
        ) : (
          section.content &&
          (change === 'removed' ? (
            <div className={`${CONTENT} mt-2 text-ink-muted line-through`}>
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
          ) : (
            <div className={`${CONTENT} mt-2`}>
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
          ))
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
