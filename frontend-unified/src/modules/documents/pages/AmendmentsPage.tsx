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
import { StatusBadge } from '../../../components/ui/Badge';

export default function AmendmentsPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const { currentOrganization, organizations: orgs } = useOrganization();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const navigate = useNavigate();

  // The URL is the filter: one document's amendments (/documents/:id/amendments) or all
  // (/amendments). Kept in state, it outlived a move from one route to the other.
  const selectedDocument = (documentId && documents.find((d) => d.id === documentId)) || null;

  useEffect(() => {
    const fetchData = async () => {
      if (!currentOrganization) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const docs = await documentsApi.list(currentOrganization.id);
        setDocuments(docs);

        // If documentId is provided, filter by that document (none, if it isn't one of this
        // organization's documents)
        if (documentId) {
          const doc = docs.find((d) => d.id === documentId);
          setAmendments(doc ? await amendmentsApi.list(documentId) : []);
        } else {
          // Fetch all amendments from all documents
          const allAmendments: Amendment[] = [];
          for (const doc of docs) {
            try {
              const amends = await amendmentsApi.list(doc.id);
              allAmendments.push(...amends);
            } catch {
              // Ignore errors for individual documents
            }
          }
          setAmendments(
            allAmendments.sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            ),
          );
        }
      } catch (err) {
        console.error('Failed to load amendments:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentOrganization, documentId]);

  const handleDocumentChange = (docId: string) => {
    navigate(docId === 'all' ? '/amendments' : `/documents/${docId}/amendments`);
  };

  const filteredAmendments =
    statusFilter === 'all' ? amendments : amendments.filter((a) => a.status === statusFilter);

  const getDocumentTitle = (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    return doc?.title || 'Unknown Document';
  };

  if (loading) {
    return <LoadingPage />;
  }

  if (!currentOrganization) {
    if (orgs.length === 0) return <NoOrganizations />;
    return (
      <EmptyState
        icon={GitBranch}
        title="No organization selected"
        description="Select an organization to view amendments."
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          {selectedDocument ? (
            <div className="flex items-center gap-2 text-sm text-ink-muted mb-1">
              <Link to="/" className="hover:text-gavel">
                {currentOrganization.name}
              </Link>
              <ChevronRight className="w-4 h-4" />
              <Link to={`/documents/${selectedDocument.id}`} className="hover:text-gavel">
                {selectedDocument.title}
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span>Amendments</span>
            </div>
          ) : null}
          <h2 className="page-title">Amendments</h2>
          <p className="text-ink-muted mt-1">
            {selectedDocument
              ? `Amendments for ${selectedDocument.title}`
              : 'All amendments across documents'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="label">Document</label>
            <select
              value={selectedDocument?.id || 'all'}
              onChange={(e) => handleDocumentChange(e.target.value)}
              className="select"
            >
              <option value="all">All Documents</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>
          </div>
          <div className="w-48">
            <label className="label">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select"
            >
              <option value="all">All Statuses</option>
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
          <div className="p-8 text-center">
            <GitBranch className="w-10 h-10 text-ink-muted mx-auto mb-3" />
            <p className="text-ink-muted">
              {amendments.length === 0
                ? 'No amendments yet'
                : 'No amendments match the selected filters'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-rule">
            {filteredAmendments.map((amendment) => (
              <Link
                key={amendment.id}
                to={`/amendments/${amendment.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-surface-2 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-medium text-ink">{amendment.title}</h4>
                    <StatusBadge status={amendment.status} />
                  </div>
                  {!selectedDocument && (
                    <div className="flex items-center gap-1 text-xs text-ink-muted mb-1">
                      <FileText className="w-3 h-3" />
                      {getDocumentTitle(amendment.documentId)}
                    </div>
                  )}
                  {amendment.description && (
                    <p className="text-sm text-ink-muted line-clamp-1">{amendment.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-ink-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Created {new Date(amendment.createdAt).toLocaleDateString()}
                    </span>
                    <span>{amendment.changes?.length || 0} change(s)</span>
                    {amendment.proposedAt && (
                      <span>Proposed {new Date(amendment.proposedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-ink-muted group-hover:text-gavel transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
