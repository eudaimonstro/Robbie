import { useEffect, useState } from 'react';
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
        const leftParam = searchParams.get('left');
        const rightParam = searchParams.get('right');

        if (vers.length >= 2) {
          const left =
            leftParam && vers.find((v) => v.id === leftParam)
              ? leftParam
              : vers[vers.length - 2].id;
          const right =
            rightParam && vers.find((v) => v.id === rightParam)
              ? rightParam
              : vers[vers.length - 1].id;

          setLeftVersionId(left);
          setRightVersionId(right);
        } else if (vers.length === 1) {
          setLeftVersionId(vers[0].id);
          setRightVersionId(vers[0].id);
        }
      } catch (err) {
        showToast('error', 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [documentId, searchParams, showToast]);

  useEffect(() => {
    const fetchDiff = async () => {
      if (!leftVersionId || !rightVersionId || leftVersionId === rightVersionId) {
        setDiff(null);
        return;
      }

      try {
        setDiffLoading(true);
        const result = await versionsApi.diff(leftVersionId, rightVersionId);
        setDiff(result);

        // Update URL
        setSearchParams({ left: leftVersionId, right: rightVersionId });
      } catch (err) {
        showToast('error', 'Failed to load diff');
        setDiff(null);
      } finally {
        setDiffLoading(false);
      }
    };

    fetchDiff();
  }, [leftVersionId, rightVersionId, setSearchParams, showToast]);

  const getVersionLabel = (versionId: string) => {
    const version = versions.find((v) => v.id === versionId);
    if (!version) return 'Unknown';
    return `Version ${version.version_number}${version.effective_date ? ` (${new Date(version.effective_date).toLocaleDateString()})` : ''}`;
  };

  const swapVersions = () => {
    setLeftVersionId(rightVersionId);
    setRightVersionId(leftVersionId);
  };

  if (loading) {
    return <LoadingPage />;
  }

  if (!document) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-2">
          Document not found
        </h2>
        <Link to="/" className="text-primary-600 hover:text-primary-700">
          Return to documents
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-secondary-500 mb-1">
          <Link to="/" className="hover:text-primary-600">
            {currentOrganization?.name}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <Link to={`/documents/${documentId}`} className="hover:text-primary-600">
            {document.title}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span>Compare Versions</span>
        </div>
        <h2 className="text-2xl font-heading font-bold text-secondary-900 dark:text-white">
          Version Comparison
        </h2>
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
                  Version {v.version_number}
                  {v.effective_date && ` - ${new Date(v.effective_date).toLocaleDateString()}`}
                  {v.id === document.current_version_id && ' (Current)'}
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
                  Version {v.version_number}
                  {v.effective_date && ` - ${new Date(v.effective_date).toLocaleDateString()}`}
                  {v.id === document.current_version_id && ' (Current)'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Diff content */}
      <div className="card">
        {leftVersionId === rightVersionId ? (
          <div className="p-8 text-center text-secondary-500">
            Select two different versions to compare
          </div>
        ) : diffLoading ? (
          <div className="p-8 text-center">
            <div className="spinner w-8 h-8 text-primary-600 mx-auto" />
            <p className="mt-2 text-secondary-500">Loading diff...</p>
          </div>
        ) : !diff || diff.changes.length === 0 ? (
          <div className="p-8 text-center text-secondary-500">
            No differences found between these versions
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
              <div className="flex items-center gap-4">
                <span className="text-sm text-secondary-600 dark:text-secondary-400">
                  {diff.changes.length} change(s) between {getVersionLabel(leftVersionId)} and{' '}
                  {getVersionLabel(rightVersionId)}
                </span>
                <div className="flex items-center gap-3 ml-auto text-sm">
                  <span className="flex items-center gap-1 text-success-600">
                    <Plus className="w-4 h-4" />
                    {diff.changes.filter((c) => c.type === 'add').length} added
                  </span>
                  <span className="flex items-center gap-1 text-danger-600">
                    <Minus className="w-4 h-4" />
                    {diff.changes.filter((c) => c.type === 'delete').length} deleted
                  </span>
                  <span className="flex items-center gap-1 text-accent-600">
                    <Edit3 className="w-4 h-4" />
                    {diff.changes.filter((c) => c.type === 'modify').length} modified
                  </span>
                </div>
              </div>
            </div>

            {/* Changes */}
            <div className="divide-y divide-secondary-100 dark:divide-secondary-700">
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
    add: 'bg-success-50 border-success-200 dark:bg-success-900/20 dark:border-success-800',
    delete: 'bg-danger-50 border-danger-200 dark:bg-danger-900/20 dark:border-danger-800',
    modify: 'bg-accent-50 border-accent-200 dark:bg-accent-900/20 dark:border-accent-800',
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
          {change.new_number_label || change.old_number_label}
          {(change.new_title || change.old_title) && ` - ${change.new_title || change.old_title}`}
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
            <p className="text-xs font-medium text-secondary-500 mb-1">Old Content</p>
            <div className="diff-delete p-3 rounded text-sm">
              {change.old_content || <span className="italic text-secondary-400">(empty)</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-secondary-500 mb-1">New Content</p>
            <div className="diff-add p-3 rounded text-sm">
              {change.new_content || <span className="italic text-secondary-400">(empty)</span>}
            </div>
          </div>
        </div>
      )}

      {change.type === 'add' && change.new_content && (
        <div className="diff-add p-3 rounded text-sm mt-2">{change.new_content}</div>
      )}

      {change.type === 'delete' && change.old_content && (
        <div className="diff-delete p-3 rounded text-sm mt-2">{change.old_content}</div>
      )}
    </div>
  );
}
