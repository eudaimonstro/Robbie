import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GitBranch, Clock, ChevronRight, FileText } from 'lucide-react';
import { useOrganization } from '../../../context/OrganizationContext';
import { NoOrganizations } from '../../../components/organizations/NoOrganizations';
import {
  documents as documentsApi,
  amendments as amendmentsApi,
  Document,
  Amendment,
} from '../../../api/client';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import { StatusBadge } from '../../../components/ui/Badge';
import { formatDate } from '../../../utils/dates';
import { count } from '../../../utils/plural';

export default function AmendmentsPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const { currentOrganization, organizations: orgs } = useOrganization();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Bumped by Try again
  const [attempt, setAttempt] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const navigate = useNavigate();
  const orgId = currentOrganization?.id;
  const timeZone = currentOrganization?.timeZone;

  // The URL is the filter: one document's amendments (/documents/:id/amendments) or all
  // (/amendments). Kept in state, it outlived a move from one route to the other.
  const selectedDocument = (documentId && documents.find((d) => d.id === documentId)) || null;

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    let canceled = false;
    const fetchData = async () => {
      try {
        setLoading(true);
        setFailed(false);
        const docs = await documentsApi.list(orgId);
        // One document's amendments (none, if it isn't one of this organization's documents),
        // or every document's in one request
        const found = documentId
          ? docs.some((d) => d.id === documentId)
            ? await amendmentsApi.list(documentId)
            : []
          : await amendmentsApi.listForOrganization(orgId);
        if (canceled) return;
        setDocuments(docs);
        setAmendments(found);
      } catch {
        if (!canceled) setFailed(true);
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    void fetchData();
    return () => {
      canceled = true;
    };
  }, [orgId, documentId, attempt]);

  const handleDocumentChange = (docId: string) => {
    navigate(docId === 'all' ? '/amendments' : `/documents/${docId}/amendments`);
  };

  const filteredAmendments =
    statusFilter === 'all' ? amendments : amendments.filter((a) => a.status === statusFilter);

  const getDocumentTitle = (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    return doc?.title || 'Unknown document';
  };

  if (loading) {
    return <LoadingPage label="Loading the amendments..." />;
  }

  if (!currentOrganization) {
    if (orgs.length === 0) return <NoOrganizations />;
    return (
      <EmptyState
        icon={GitBranch}
        title="No organization selected"
        description="Choose an organization from the menu at the top of the page."
      />
    );
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-5xl">
        <h2 className="page-title mb-6">Amendments</h2>
        <ErrorState
          title="Couldn't load the amendments."
          description="Check your connection, then try again."
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        {selectedDocument ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted mb-1">
            <Link to="/" className="inline-flex items-center max-md:min-h-11 hover:text-gavel">
              {currentOrganization.name}
            </Link>
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
            <Link to={`/documents/${selectedDocument.id}`} className="inline-flex items-center max-md:min-h-11 hover:text-gavel">
              {selectedDocument.title}
            </Link>
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
            <span>Amendments</span>
          </div>
        ) : null}
        <h2 className="page-title">Amendments</h2>
        <p className="text-ink-muted mt-1">
          {selectedDocument
            ? `Amendments for ${selectedDocument.title}`
            : 'Every amendment to the documents'}
        </p>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="amendments-document" className="label">
              Document
            </label>
            <select
              id="amendments-document"
              value={selectedDocument?.id || 'all'}
              onChange={(e) => handleDocumentChange(e.target.value)}
              className="select"
            >
              <option value="all">All documents</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:w-48">
            <label htmlFor="amendments-status" className="label">
              Status
            </label>
            <select
              id="amendments-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="proposed">Proposed</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="tabled">Tabled</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>
        </div>
      </div>

      {/* Amendments list */}
      <div className="card">
        {filteredAmendments.length === 0 ? (
          <p className="p-8 text-center text-ink-muted">
            {amendments.length === 0
              ? 'No amendments yet.'
              : 'No amendments match the selected filters.'}
          </p>
        ) : (
          <div className="divide-y divide-rule">
            {filteredAmendments.map((amendment) => (
              <Link
                key={amendment.id}
                to={`/amendments/${amendment.id}`}
                className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 hover:bg-surface-2 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                    <h4 className="font-medium text-ink">{amendment.title}</h4>
                    <StatusBadge status={amendment.status} />
                  </div>
                  {!selectedDocument && (
                    <div className="flex items-center gap-1 text-xs text-ink-muted mb-1">
                      <FileText className="w-3 h-3" aria-hidden="true" />
                      {getDocumentTitle(amendment.documentId)}
                    </div>
                  )}
                  {amendment.description && (
                    <p className="text-sm text-ink-muted line-clamp-1">{amendment.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-ink-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      <span>Created {formatDate(amendment.createdAt, timeZone)}</span>
                    </span>
                    <span>{count(amendment.changes?.length ?? 0, 'change')}</span>
                    {amendment.proposedAt && (
                      <span>Proposed {formatDate(amendment.proposedAt, timeZone)}</span>
                    )}
                  </div>
                </div>
                <ChevronRight
                  className="w-5 h-5 shrink-0 text-ink-muted group-hover:text-gavel transition-colors"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
