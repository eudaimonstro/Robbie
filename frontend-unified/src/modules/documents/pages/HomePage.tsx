import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Clock, ChevronRight, Building2, GitBranch, Calendar, Users } from 'lucide-react';
import { useOrganization, useCan } from '../../../context/OrganizationContext';
import {
  documents as documentsApi,
  amendments as amendmentsApi,
  schedule as scheduleApi,
  Document,
  Amendment,
  ScheduledMeeting,
} from '../../../api/client';
import { formatMeetingTime } from '../../../utils/dates';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import EmptyState from '../../../components/ui/EmptyState';
import { NoOrganizations } from '../../../components/organizations/NoOrganizations';
import { StatusBadge, DocumentTypeBadge } from '../../../components/ui/Badge';

export default function HomePage() {
  const { currentOrganization, organizations: orgs, loading: orgLoading } = useOrganization();
  // Documents are created by secretaries and above
  const canCreate = useCan('secretary');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [recentAmendments, setRecentAmendments] = useState<Amendment[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<ScheduledMeeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrganization) {
      setDocuments([]);
      setRecentAmendments([]);
      setUpcomingMeetings([]);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const [docs, scheduled] = await Promise.all([
          documentsApi.list(currentOrganization.id),
          scheduleApi.list(currentOrganization.id),
        ]);
        setDocuments(docs);
        // The schedule lists the meetings not yet adjourned first, soonest first
        setUpcomingMeetings(scheduled.filter((m) => !m.endedAt).slice(0, 3));

        // Fetch amendments from all documents
        const allAmendments: Amendment[] = [];
        for (const doc of docs.slice(0, 5)) {
          try {
            const amends = await amendmentsApi.list(doc.id);
            allAmendments.push(...amends);
          } catch {
            // Ignore errors
          }
        }
        setRecentAmendments(
          allAmendments
            .filter((a) => a.status === 'draft' || a.status === 'proposed')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5),
        );
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentOrganization]);

  if (orgLoading || loading) {
    return <LoadingPage />;
  }

  if (!currentOrganization) {
    if (orgs.length === 0) return <NoOrganizations />;
    return (
      <EmptyState
        icon={Building2}
        title="No organization selected"
        description="Select or create an organization to get started managing your bylaws and documents."
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      {/* Below sm the button goes under the title at full width, on one line */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="page-title">Dashboard</h2>
          <p className="text-ink-muted mt-1">Welcome to {currentOrganization.name}</p>
        </div>
        <Link
          to="/meetings"
          className="btn-primary flex w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap sm:w-auto"
        >
          <Users className="w-4 h-4" />
          Join Live Meeting
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gavel-tint flex items-center justify-center">
              <FileText className="w-6 h-6 text-gavel" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{documents.length}</p>
              <p className="text-sm text-ink-muted">Documents</p>
            </div>
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-caution-tint flex items-center justify-center">
              <GitBranch className="w-6 h-6 text-caution-ink" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{recentAmendments.length}</p>
              <p className="text-sm text-ink-muted">Pending Amendments</p>
            </div>
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-carried-tint flex items-center justify-center">
              <Calendar className="w-6 h-6 text-carried" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{upcomingMeetings.length}</p>
              <p className="text-sm text-ink-muted">Upcoming Meetings</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Documents List */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="px-6 py-4 border-b border-rule flex items-center justify-between">
              <h3 className="font-semibold text-ink">Documents</h3>
              <Link to="/" className="text-sm text-gavel hover:underline">
                View all
              </Link>
            </div>

            {documents.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="w-10 h-10 text-ink-muted mx-auto mb-3" />
                <p className="text-ink-muted">
                  {canCreate
                    ? 'No documents yet. Create your first document to get started.'
                    : 'No documents yet.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-rule">
                {documents.map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/documents/${doc.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-surface-2 transition-colors group"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <div className="w-10 h-10 shrink-0 rounded-lg bg-gavel-tint flex items-center justify-center">
                        <FileText className="w-5 h-5 text-gavel" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-ink truncate">{doc.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <DocumentTypeBadge type={doc.docType} />
                          <span className="text-xs text-ink-muted flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(doc.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 shrink-0 text-ink-muted group-hover:text-gavel transition-colors" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Pending Amendments */}
          <div className="card">
            <div className="px-4 py-3 border-b border-rule">
              <h3 className="font-semibold text-ink text-sm">Pending Amendments</h3>
            </div>
            {recentAmendments.length === 0 ? (
              <div className="p-4 text-center text-sm text-ink-muted">No pending amendments</div>
            ) : (
              <div className="divide-y divide-rule">
                {recentAmendments.map((amendment) => (
                  <Link
                    key={amendment.id}
                    to={`/amendments/${amendment.id}`}
                    className="block px-4 py-3 hover:bg-surface-2 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="min-w-0 font-medium text-sm text-ink truncate">
                        {amendment.title}
                      </span>
                      <span className="shrink-0">
                        <StatusBadge status={amendment.status} />
                      </span>
                    </div>
                    {amendment.description && (
                      <p className="text-xs text-ink-muted line-clamp-1">{amendment.description}</p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Meetings */}
          <div className="card">
            <div className="px-4 py-3 border-b border-rule">
              <h3 className="font-semibold text-ink text-sm">Upcoming Meetings</h3>
            </div>
            {upcomingMeetings.length === 0 ? (
              <div className="p-4 text-center text-sm text-ink-muted">No upcoming meetings</div>
            ) : (
              <div className="divide-y divide-rule">
                {upcomingMeetings.map((meeting) => (
                  <Link
                    key={meeting.id}
                    to={`/meetings/${meeting.robbieCode}`}
                    className="block px-4 py-3 hover:bg-surface-2 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="min-w-0 font-medium text-sm text-ink truncate">
                        {meeting.title || 'Untitled meeting'}
                      </span>
                      <span className="meeting-code shrink-0 text-xs text-ink-muted">
                        {meeting.robbieCode}
                      </span>
                    </div>
                    <p className="text-xs text-ink-muted flex items-center gap-1">
                      <Calendar className="w-3 h-3" aria-hidden="true" />
                      {meeting.scheduledFor
                        ? formatMeetingTime(meeting.scheduledFor)
                        : 'No date set'}
                    </p>
                  </Link>
                ))}
              </div>
            )}
            <div className="px-4 py-2 border-t border-rule flex justify-between">
              <Link to="/meetings" className="text-sm text-gavel hover:underline">
                All scheduled meetings
              </Link>
              <Link to="/bylawyer-meetings" className="text-sm text-gavel hover:underline">
                Meeting records
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
