import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock, FileText, Eye, AlertCircle, Printer, RefreshCw } from 'lucide-react';
import {
  publicDocuments,
  PublicDocument,
  PublicVersion,
  SectionTree as SectionTreeType,
} from '../../../api/client';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { DocumentTypeBadge } from '../../../components/ui/Badge';
import SectionTree from '../components/SectionTree';
import { useToast } from '../../../context/ToastContext';
import { formatCalendarDate } from '../../../utils/dates';
import { isNotFound } from '../../../utils/httpErrors';

export default function PublicDocumentPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { showToast } = useToast();

  const [doc, setDoc] = useState<PublicDocument | null>(null);
  const [versions, setVersions] = useState<PublicVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<PublicVersion | null>(null);
  const [sectionTree, setSectionTree] = useState<SectionTreeType[]>([]);
  const [loading, setLoading] = useState(true);
  // A link that leads nowhere (or whose sharing was turned off), or a load that failed
  const [error, setError] = useState<'unavailable' | 'failed' | null>(null);

  const fetchDocument = useCallback(async () => {
    if (!shareToken) return;

    try {
      setLoading(true);
      setError(null);

      const shared = await publicDocuments.get(shareToken);

      setDoc({ ...shared.document, currentVersionId: shared.currentVersion?.id ?? null });
      setVersions(shared.versions);

      // Show the current version, or the latest one if none is marked current
      if (shared.currentVersion) {
        setSelectedVersion(shared.currentVersion);
        setSectionTree(shared.currentVersion.sections);
      } else if (shared.versions.length > 0) {
        const latest = await publicDocuments.getVersion(shareToken, shared.versions[0].id);
        setSelectedVersion(latest);
        setSectionTree(latest.sections);
      }
    } catch (err: unknown) {
      // The API answers a bad link, and a share turned off, with a 404
      const message = err instanceof Error ? err.message : '';
      setError(isNotFound(err) || /not found|disabled/i.test(message) ? 'unavailable' : 'failed');
    } finally {
      setLoading(false);
    }
  }, [shareToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from the API: the fetcher marks itself loading before its request (it is also the refresh)
    fetchDocument();
  }, [fetchDocument]);

  const handleVersionChange = async (versionId: string) => {
    if (!shareToken) return;

    const version = versions.find((v) => v.id === versionId);
    if (version) {
      setSelectedVersion(version);
      try {
        const shared = await publicDocuments.getVersion(shareToken, version.id);
        setSectionTree(shared.sections);
      } catch {
        showToast('error', "Couldn't load that version. Try again.");
      }
    }
  };

  if (loading) {
    return <LoadingPage label="Loading the document..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-4">
        <div role="alert" className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-ink-muted mx-auto mb-4" aria-hidden="true" />
          {error === 'unavailable' ? (
            <>
              <h2 className="card-title mb-2">Document not available</h2>
              <p className="text-ink-muted mb-6">
                The link may be wrong, or sharing may have been turned off. Ask whoever sent it for
                a new one.
              </p>
            </>
          ) : (
            <>
              <h2 className="card-title mb-2">Couldn&apos;t load the document</h2>
              <p className="text-ink-muted mb-6">Check your connection, then try again.</p>
              <button type="button" className="btn-primary" onClick={() => void fetchDocument()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-ink-muted mx-auto mb-4" aria-hidden="true" />
        <h2 className="card-title mb-2">Document not found</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      {/* Readonly banner */}
      <div className="bg-gavel-tint border-b border-gavel/30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-center gap-2">
          <Eye className="w-4 h-4 shrink-0 text-gavel" aria-hidden="true" />
          <span className="text-sm text-ink">You are viewing a shared document (read-only)</span>
        </div>
      </div>

      {/* The page's content: a landmark, beside the banner above it */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header: the title, then the version and Print, under it on phones */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="page-title">{doc.title}</h1>
              <DocumentTypeBadge type={doc.docType} />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 sm:shrink-0">
            {/* Version selector */}
            <select
              aria-label="Version"
              value={selectedVersion?.id || ''}
              onChange={(e) => handleVersionChange(e.target.value)}
              className="select w-full sm:w-auto text-sm py-1.5"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.versionNumber}
                  {v.id === doc.currentVersionId ? ' (current)' : ''}
                  {v.effectiveDate && ` - ${formatCalendarDate(v.effectiveDate)}`}
                </option>
              ))}
            </select>

            {/* The browser's print dialog saves a PDF */}
            {selectedVersion && (
              <Link
                to={`/share/${shareToken}/print?version=${selectedVersion.id}&print=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary btn-sm w-full sm:w-auto shrink-0 whitespace-nowrap"
              >
                <Printer className="w-4 h-4 shrink-0" aria-hidden="true" />
                Print or save as PDF
              </Link>
            )}
          </div>
        </div>

        {/* Section tree */}
        <div className="card">
          <div className="px-4 py-3 border-b border-rule">
            <h2 className="label-caps">Contents</h2>
          </div>

          <div className="p-2 sm:p-4">
            {sectionTree.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-10 h-10 text-ink-muted mx-auto mb-3" aria-hidden="true" />
                <p className="text-ink-muted">This document has no content yet.</p>
              </div>
            ) : (
              <SectionTree sections={sectionTree} editable={false} />
            )}
          </div>
        </div>

        {/* Version info */}
        {selectedVersion && (
          <div className="mt-4 card p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
              {selectedVersion.effectiveDate && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" aria-hidden="true" />
                  Effective {formatCalendarDate(selectedVersion.effectiveDate)}
                </div>
              )}
              {selectedVersion.adoptedAt && (
                <div>Adopted {formatCalendarDate(selectedVersion.adoptedAt)}</div>
              )}
              {selectedVersion.notes && (
                <div className="min-w-0 flex-1 truncate">Notes: {selectedVersion.notes}</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
