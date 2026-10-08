import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock, FileText, Eye, AlertCircle, Printer } from 'lucide-react';
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

export default function PublicDocumentPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { showToast } = useToast();

  const [doc, setDoc] = useState<PublicDocument | null>(null);
  const [versions, setVersions] = useState<PublicVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<PublicVersion | null>(null);
  const [sectionTree, setSectionTree] = useState<SectionTreeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      console.error(err);
      if (err && typeof err === 'object' && 'message' in err) {
        const errorObj = err as { message: string };
        // The API reports a bad link as "Document not found" and a disabled share as
        // "Sharing is disabled for this document"
        if (/not found|disabled/i.test(errorObj.message)) {
          setError(
            'This document is not available. The link may be invalid or sharing may have been disabled.',
          );
        } else {
          setError('Failed to load document');
        }
      } else {
        setError('Failed to load document');
      }
    } finally {
      setLoading(false);
    }
  }, [shareToken]);

  useEffect(() => {
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
        showToast('error', 'Failed to load version');
      }
    }
  };

  if (loading) {
    return <LoadingPage label="Loading the document..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-gavel mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-ink mb-2">Document Not Available</h2>
          <p className="text-ink-muted mb-6">{error}</p>
          <Link to="/" className="btn-primary">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-ink-muted mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-ink mb-2">Document not found</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      {/* Readonly banner */}
      <div className="bg-gavel-tint border-b border-gavel/30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-center gap-2">
          <Eye className="w-4 h-4 text-gavel" />
          <span className="text-sm text-ink">You are viewing a shared document (read-only)</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="page-title">{doc.title}</h1>
              <DocumentTypeBadge type={doc.docType} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Version selector */}
            <select
              value={selectedVersion?.id || ''}
              onChange={(e) => handleVersionChange(e.target.value)}
              className="select text-sm py-1.5"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.versionNumber}
                  {v.id === doc.currentVersionId ? ' (Current)' : ''}
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
                className="btn-secondary btn-sm shrink-0 whitespace-nowrap"
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
            <h3 className="font-semibold text-ink">Document Content</h3>
          </div>

          <div className="p-4">
            {sectionTree.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-10 h-10 text-ink-muted mx-auto mb-3" />
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
            <div className="flex items-center gap-4 text-sm text-ink-muted">
              {selectedVersion.effectiveDate && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Effective: {formatCalendarDate(selectedVersion.effectiveDate)}
                </div>
              )}
              {selectedVersion.adoptedAt && (
                <div>Adopted: {formatCalendarDate(selectedVersion.adoptedAt)}</div>
              )}
              {selectedVersion.notes && (
                <div className="flex-1 truncate">Notes: {selectedVersion.notes}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
