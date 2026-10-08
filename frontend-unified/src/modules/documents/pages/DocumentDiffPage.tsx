import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, ArrowLeftRight, Plus, Minus, Edit3 } from 'lucide-react';
import {
  documents as documentsApi,
  versions as versionsApi,
  Document,
  Version,
  DiffResult,
  DiffChange,
} from '../../../api/client';
import { useOrganization } from '../../../context/OrganizationContext';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { formatCalendarDate } from '../../../utils/dates';
import { isNotFound } from '../../../utils/httpErrors';
import { count } from '../../../utils/plural';
import ErrorState from '../../../components/ui/ErrorState';
import { WordDiff } from '../components/WordDiff';

export default function DocumentDiffPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentOrganization } = useOrganization();

  const [document, setDocument] = useState<Document | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [leftVersionId, setLeftVersionId] = useState<string>('');
  const [rightVersionId, setRightVersionId] = useState<string>('');
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<'missing' | 'failed' | null>(null);
  // Bumped by Try again
  const [attempt, setAttempt] = useState(0);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffFailed, setDiffFailed] = useState(false);
  // The versions named in the URL when the page opened. Later URL changes are this page's own
  // (recording the selection), so they must not reload it.
  const initialParams = useRef(searchParams);

  useEffect(() => {
    const fetchData = async () => {
      if (!documentId) return;

      try {
        setLoading(true);
        setLoadError(null);
        const [doc, vers] = await Promise.all([
          documentsApi.get(documentId),
          versionsApi.list(documentId),
        ]);

        setDocument(doc);
        setVersions(vers);

        // Set initial versions from URL or defaults
        const leftParam = initialParams.current.get('left');
        const rightParam = initialParams.current.get('right');

        if (vers.length >= 2) {
          // By default, compare the newest version (right) with the one before it (left)
          const [newest, previous] = [...vers].sort((a, b) => b.versionNumber - a.versionNumber);
          const left = leftParam && vers.find((v) => v.id === leftParam) ? leftParam : previous.id;
          const right =
            rightParam && vers.find((v) => v.id === rightParam) ? rightParam : newest.id;

          setLeftVersionId(left);
          setRightVersionId(right);
        } else if (vers.length === 1) {
          setLeftVersionId(vers[0].id);
          setRightVersionId(vers[0].id);
        }
      } catch (err) {
        // The page says it: a toast as well would say it twice
        setLoadError(isNotFound(err) ? 'missing' : 'failed');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [documentId, attempt]);

  useEffect(() => {
    // A response for a selection that has since changed is ignored
    let current = true;
    const fetchDiff = async () => {
      if (!leftVersionId || !rightVersionId || leftVersionId === rightVersionId) {
        setDiff(null);
        return;
      }

      try {
        setDiffLoading(true);
        setDiffFailed(false);
        const result = await versionsApi.diff(leftVersionId, rightVersionId);
        if (!current) return;
        setDiff(result);

        // Record the selection in the URL, without adding a history entry for each choice
        setSearchParams({ left: leftVersionId, right: rightVersionId }, { replace: true });
      } catch {
        if (!current) return;
        setDiff(null);
        setDiffFailed(true);
      } finally {
        if (current) setDiffLoading(false);
      }
    };

    fetchDiff();
    return () => {
      current = false;
    };
  }, [leftVersionId, rightVersionId, setSearchParams, attempt]);

  const getVersionLabel = (versionId: string) => {
    const version = versions.find((v) => v.id === versionId);
    if (!version) return 'Unknown';
    return `Version ${version.versionNumber}${version.effectiveDate ? ` (${formatCalendarDate(version.effectiveDate)})` : ''}`;
  };

  const swapVersions = () => {
    setLeftVersionId(rightVersionId);
    setRightVersionId(leftVersionId);
  };

  if (loading) {
    return <LoadingPage label="Loading the versions..." />;
  }

  if (loadError === 'failed') {
    return (
      <div className="mx-auto max-w-xl py-12">
        <ErrorState
          title="Couldn't load the versions."
          description="Check your connection, then try again."
          onRetry={() => setAttempt((n) => n + 1)}
        >
          <Link to={`/documents/${documentId}`} className="text-gavel hover:underline">
            Back to the document
          </Link>
        </ErrorState>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-12">
        <h2 className="card-title mb-2">Document not found</h2>
        <p className="mb-4 text-ink-muted">
          This document doesn&apos;t exist, or it isn&apos;t shared with you.
        </p>
        <Link to="/" className="text-gavel hover:underline">
          All documents
        </Link>
      </div>
    );
  }

  const versionOption = (v: Version) => (
    <option key={v.id} value={v.id}>
      Version {v.versionNumber}
      {v.effectiveDate && ` - ${formatCalendarDate(v.effectiveDate)}`}
      {v.id === document.currentVersionId && ' (current)'}
    </option>
  );

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted mb-1">
          <Link to="/" className="hover:text-gavel">
            {currentOrganization?.name}
          </Link>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
          <Link to={`/documents/${documentId}`} className="hover:text-gavel">
            {document.title}
          </Link>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
          <span>Compare versions</span>
        </div>
        <h2 className="page-title">Version comparison</h2>
      </div>

      {/* Version selectors */}
      <div className="card p-4 mb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
          <div className="min-w-0 flex-1">
            <label htmlFor="diff-from" className="label">
              From
            </label>
            <select
              id="diff-from"
              value={leftVersionId}
              onChange={(e) => setLeftVersionId(e.target.value)}
              className="select"
            >
              {versions.map(versionOption)}
            </select>
          </div>

          <button
            type="button"
            onClick={swapVersions}
            className="btn-ghost self-center px-3"
            title="Swap the versions"
            aria-label="Swap the versions"
          >
            <ArrowLeftRight className="w-5 h-5 max-sm:rotate-90" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">
            <label htmlFor="diff-to" className="label">
              To
            </label>
            <select
              id="diff-to"
              value={rightVersionId}
              onChange={(e) => setRightVersionId(e.target.value)}
              className="select"
            >
              {versions.map(versionOption)}
            </select>
          </div>
        </div>
      </div>

      {/* Diff content */}
      <div className="card">
        {leftVersionId === rightVersionId ? (
          <div className="p-8 text-center text-ink-muted">Choose two different versions.</div>
        ) : diffLoading ? (
          <div role="status" className="p-8 text-center">
            <div className="spinner w-8 h-8 text-gavel mx-auto" aria-hidden="true" />
            <p className="mt-2 text-ink-muted">Comparing the versions...</p>
          </div>
        ) : diffFailed ? (
          <ErrorState
            inline
            title="Couldn't compare the versions."
            onRetry={() => setAttempt((n) => n + 1)}
          />
        ) : !diff || diff.changes.length === 0 ? (
          <div className="p-8 text-center text-ink-muted">These versions read the same.</div>
        ) : (
          <>
            {/* Summary */}
            <div className="px-4 py-4 sm:px-6 border-b border-rule">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-sm text-ink-muted">
                  {count(diff.changes.length, 'change')} from {getVersionLabel(leftVersionId)} to{' '}
                  {getVersionLabel(rightVersionId)}
                </span>
                <div className="flex flex-wrap items-center gap-3 sm:ml-auto text-sm">
                  <span className="flex items-center gap-1 text-carried">
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    {diff.changes.filter((c) => c.type === 'add').length} added
                  </span>
                  <span className="flex items-center gap-1 text-ink">
                    <Minus className="w-4 h-4" aria-hidden="true" />
                    {diff.changes.filter((c) => c.type === 'delete').length} removed
                  </span>
                  <span className="flex items-center gap-1 text-caution-ink">
                    <Edit3 className="w-4 h-4" aria-hidden="true" />
                    {diff.changes.filter((c) => c.type === 'modify').length} changed
                  </span>
                </div>
              </div>
            </div>

            {/* Changes */}
            <div className="divide-y divide-rule">
              {diff.changes.map((change, index) => (
                <DiffChangeItem key={index} change={change} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DiffChangeItem({ change }: { change: DiffChange }) {
  const frames = {
    add: 'border-carried',
    delete: 'border-rule',
    modify: 'border-caution',
  };
  const labels = { add: 'Added', delete: 'Removed', modify: 'Changed' };
  const badges = { add: 'badge-passed', delete: 'badge-withdrawn', modify: 'badge-proposed' };
  const icons = { add: Plus, delete: Minus, modify: Edit3 };
  const Icon = icons[change.type] || Edit3;
  const heading = [
    change.newNumberLabel || change.oldNumberLabel,
    change.newTitle || change.oldTitle,
  ]
    .filter(Boolean)
    .join(' ');
  const renamed =
    change.type === 'modify' &&
    (change.oldNumberLabel !== change.newNumberLabel || change.oldTitle !== change.newTitle);

  return (
    <div className={`p-4 sm:px-6 border-l-4 ${frames[change.type] || frames.modify}`}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-ink-muted" aria-hidden="true" />
        <span className="font-document font-semibold text-ink">
          {heading || 'Untitled section'}
        </span>
        <span className={badges[change.type] || 'badge'}>{labels[change.type]}</span>
      </div>

      {renamed && (
        <div className="mb-2 text-sm text-ink-muted">
          <WordDiff
            before={[change.oldNumberLabel, change.oldTitle].filter(Boolean).join(' ')}
            after={[change.newNumberLabel, change.newTitle].filter(Boolean).join(' ')}
          />
        </div>
      )}

      {/* One paragraph with the words that changed marked, not two whole paragraphs */}
      {change.type === 'modify' && (change.oldContent || change.newContent) && (
        <WordDiff before={change.oldContent ?? ''} after={change.newContent ?? ''} />
      )}

      {change.type === 'add' && change.newContent && (
        <p className="whitespace-pre-wrap font-document leading-relaxed text-ink">
          {change.newContent}
        </p>
      )}

      {change.type === 'delete' && change.oldContent && (
        <p className="whitespace-pre-wrap font-document leading-relaxed text-ink-muted line-through decoration-ink">
          {change.oldContent}
        </p>
      )}
    </div>
  );
}
