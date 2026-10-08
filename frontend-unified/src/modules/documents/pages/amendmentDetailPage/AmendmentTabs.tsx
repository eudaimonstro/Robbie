import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Amendment } from '../../../../api/client';
import { AmendmentPreview } from './AmendmentPreview';

const tabClass = (current: boolean) =>
  `rounded-md px-3 py-1.5 max-md:min-h-11 text-sm font-medium ${current ? 'bg-gavel-tint text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`;

/**
 * An amendment's changes and, while it is a draft or proposed, a Preview of the document as it
 * would read; an applied amendment links to the version it produced instead
 */
export function AmendmentTabs({
  amendment,
  changes,
}: {
  amendment: Amendment;
  changes: ReactNode;
}) {
  const [tab, setTab] = useState<'changes' | 'preview'>('changes');
  const previewable = amendment.status === 'draft' || amendment.status === 'proposed';
  const showPreview = previewable && tab === 'preview';

  return (
    <div className="space-y-3">
      {amendment.resultingVersionId && (
        <p className="card p-4 text-sm text-ink">
          Adopted and applied.{' '}
          <Link
            to={`/documents/${amendment.documentId}?version=${amendment.resultingVersionId}`}
            className="text-gavel hover:underline"
          >
            Open the version it produced
          </Link>
        </p>
      )}
      {previewable && (
        <div role="tablist" aria-label="The amendment" className="flex gap-2">
          <button
            type="button"
            role="tab"
            id="amendment-changes-tab"
            aria-selected={!showPreview}
            aria-controls="amendment-panel"
            className={tabClass(!showPreview)}
            onClick={() => setTab('changes')}
          >
            Changes
          </button>
          <button
            type="button"
            role="tab"
            id="amendment-preview-tab"
            aria-selected={showPreview}
            aria-controls="amendment-panel"
            className={tabClass(showPreview)}
            onClick={() => setTab('preview')}
          >
            Preview
          </button>
        </div>
      )}
      <div
        id="amendment-panel"
        role={previewable ? 'tabpanel' : undefined}
        aria-labelledby={
          previewable
            ? showPreview
              ? 'amendment-preview-tab'
              : 'amendment-changes-tab'
            : undefined
        }
      >
        {/* Mounted each time the tab opens, so the preview follows changes just made */}
        {showPreview ? <AmendmentPreview amendmentId={amendment.id} /> : changes}
      </div>
    </div>
  );
}
