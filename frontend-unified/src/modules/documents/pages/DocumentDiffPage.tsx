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
import { useToast } from '../../../context/ToastContext';
import { formatCalendarDate } from '../../../utils/dates';

export default function DocumentDiffPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentOrganization } = useOrganization();
  const { showToast } = useToast();

  const [document, setDocument] = useState<Document | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [leftVersionId, setLeftVersionId] = useState<string>('');
  const [rightVersionId, setRightVersionId] = useState<string>('');
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);
  // The versions named in the URL when the page opened. Later URL changes are this page's own
  // (recording the selection), so they must not reload it.
  const initialParams = useRef(searchParams);

  useEffect(() => {
    const fetchData = async () => {
      if (!documentId) return;

      try {
        setLoading(true);
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
      } catch {
        showToast('error', 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [documentId, showToast]);

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
        const result = await versionsApi.diff(leftVersionId, rightVersionId);
        if (!current) return;
        setDiff(result);

        // Record the selection in the URL, without adding a history entry for each choice
        setSearchParams({ left: leftVersionId, right: rightVersionId }, { replace: true });
      } catch {
        if (!current) return;
        showToast('error', 'Failed to load diff');
        setDiff(null);
      } finally {
        if (current) setDiffLoading(false);
      }
    };

    fetchDiff();
    return () => {
      current = false;
    };
  }, [leftVersionId, rightVersionId, setSearchParams, showToast]);

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

  if (!document) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-ink mb-2">Document not found</h2>
        <Link to="/" className="text-gavel hover:underline">
          Return to documents
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-ink-muted mb-1">
          <Link to="/" className="hover:text-gavel">
            {currentOrganization?.name}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <Link to={`/documents/${documentId}`} className="hover:text-gavel">
            {document.title}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span>Compare Versions</span>
        </div>
        <h2 className="page-title">Version Comparison</h2>
      </div>

      {/* Version selectors */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="label">From Version</label>
            <select
              value={leftVersionId}
              onChange={(e) => setLeftVersionId(e.target.value)}
              className="select"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.versionNumber}
                  {v.effectiveDate && ` - ${formatCalendarDate(v.effectiveDate)}`}
                  {v.id === document.currentVersionId && ' (Current)'}
                </option>
              ))}
            </select>
          </div>

          <button onClick={swapVersions} className="btn-ghost p-2 mt-6" title="Swap versions">
            <ArrowLeftRight className="w-5 h-5" />
          </button>

          <div className="flex-1">
            <label className="label">To Version</label>
            <select
              value={rightVersionId}
              onChange={(e) => setRightVersionId(e.target.value)}
              className="select"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.versionNumber}
                  {v.effectiveDate && ` - ${formatCalendarDate(v.effectiveDate)}`}
                  {v.id === document.currentVersionId && ' (Current)'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Diff content */}
      <div className="card">
        {leftVersionId === rightVersionId ? (
          <div className="p-8 text-center text-ink-muted">
            Select two different versions to compare
          </div>
        ) : diffLoading ? (
          <div className="p-8 text-center">
            <div className="spinner w-8 h-8 text-gavel mx-auto" />
            <p className="mt-2 text-ink-muted">Loading diff...</p>
          </div>
        ) : !diff || diff.changes.length === 0 ? (
          <div className="p-8 text-center text-ink-muted">
            No differences found between these versions
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="px-6 py-4 border-b border-rule">
              <div className="flex items-center gap-4">
                <span className="text-sm text-ink-muted">
                  {diff.changes.length} change(s) between {getVersionLabel(leftVersionId)} and{' '}
                  {getVersionLabel(rightVersionId)}
                </span>
                <div className="flex items-center gap-3 ml-auto text-sm">
                  <span className="flex items-center gap-1 text-carried">
                    <Plus className="w-4 h-4" />
                    {diff.changes.filter((c) => c.type === 'add').length} added
                  </span>
                  <span className="flex items-center gap-1 text-gavel">
                    <Minus className="w-4 h-4" />
                    {diff.changes.filter((c) => c.type === 'delete').length} deleted
                  </span>
                  <span className="flex items-center gap-1 text-caution-ink">
                    <Edit3 className="w-4 h-4" />
                    {diff.changes.filter((c) => c.type === 'modify').length} modified
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
  const typeColors = {
    add: 'bg-carried-tint border-carried/40',
    delete: 'bg-gavel-tint border-gavel/30',
    modify: 'bg-caution-tint border-caution/40',
  };

  const typeLabels = {
    add: 'Added',
    delete: 'Deleted',
    modify: 'Modified',
  };

  const typeIcons = {
    add: Plus,
    delete: Minus,
    modify: Edit3,
  };

  const Icon = typeIcons[change.type] || Edit3;

  const colorClass = typeColors[change.type] || typeColors.modify;

  return (
    <div className={`p-4 border-l-4 ${colorClass}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" />
        <span className="font-medium text-sm">
          {change.newNumberLabel || change.oldNumberLabel}
          {(change.newTitle || change.oldTitle) && ` - ${change.newTitle || change.oldTitle}`}
        </span>
        <span
          className={`badge ${
            change.type === 'add'
              ? 'badge-passed'
              : change.type === 'delete'
                ? 'badge-failed'
                : 'badge-proposed'
          }`}
        >
          {typeLabels[change.type]}
        </span>
      </div>

      {change.type === 'modify' && (
        <div className="grid grid-cols-2 gap-4 mt-3">
          <div>
            <p className="text-xs font-medium text-ink-muted mb-1">Old Content</p>
            <div className="diff-delete p-3 rounded-sm text-sm">
              {change.oldContent || <span className="italic text-ink-muted">(empty)</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-muted mb-1">New Content</p>
            <div className="diff-add p-3 rounded-sm text-sm">
              {change.newContent || <span className="italic text-ink-muted">(empty)</span>}
            </div>
          </div>
        </div>
      )}

      {change.type === 'add' && change.newContent && (
        <div className="diff-add p-3 rounded-sm text-sm mt-2">{change.newContent}</div>
      )}

      {change.type === 'delete' && change.oldContent && (
        <div className="diff-delete p-3 rounded-sm text-sm mt-2">{change.oldContent}</div>
      )}
    </div>
  );
}
