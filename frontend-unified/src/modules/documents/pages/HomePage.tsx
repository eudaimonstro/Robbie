import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Clock, ChevronRight, Building2, GitBranch, Calendar } from 'lucide-react'
import { useOrganization } from '../../../context/OrganizationContext'
import { documents as documentsApi, amendments as amendmentsApi, meetings as meetingsApi, Document, Amendment, Meeting } from '../../../api/client'
import { LoadingPage } from '../../../components/ui/LoadingSpinner'
import EmptyState from '../../../components/ui/EmptyState'
import { StatusBadge, DocumentTypeBadge, MeetingTypeBadge } from '../../../components/ui/Badge'

export default function HomePage() {
  const { currentOrganization, loading: orgLoading } = useOrganization()
  const [documents, setDocuments] = useState<Document[]>([])
  const [recentAmendments, setRecentAmendments] = useState<Amendment[]>([])
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentOrganization) {
      setDocuments([])
      setRecentAmendments([])
      setUpcomingMeetings([])
      setLoading(false)
      return
    }

    const fetchData = async () => {
      try {
        setLoading(true)
        const [docs, mtgs] = await Promise.all([
          documentsApi.list(currentOrganization.id),
          meetingsApi.list(currentOrganization.id),
        ])
        setDocuments(docs)
        setUpcomingMeetings(mtgs.filter(m => m.status === 'scheduled').slice(0, 3))

        // Fetch amendments from all documents
        const allAmendments: Amendment[] = []
        for (const doc of docs.slice(0, 5)) {
          try {
            const amends = await amendmentsApi.list(doc.id)
            allAmendments.push(...amends)
          } catch {
            // Ignore errors
          }
        }
        setRecentAmendments(
          allAmendments
            .filter(a => a.status === 'draft' || a.status === 'proposed')
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5)
        )
      } catch (err) {
        console.error('Failed to load data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [currentOrganization])

  if (orgLoading || loading) {
    return <LoadingPage />
  }

  if (!currentOrganization) {
    return (
      <EmptyState
        icon={Building2}
        title="No organization selected"
        description="Select or create an organization to get started managing your bylaws and documents."
      />
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-heading font-bold text-secondary-900 dark:text-white">
          Dashboard
        </h2>
        <p className="text-secondary-600 dark:text-secondary-400 mt-1">
          Welcome to {currentOrganization.name}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900 dark:text-white">
                {documents.length}
              </p>
              <p className="text-sm text-secondary-500">Documents</p>
            </div>
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center">
              <GitBranch className="w-6 h-6 text-accent-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900 dark:text-white">
                {recentAmendments.length}
              </p>
              <p className="text-sm text-secondary-500">Pending Amendments</p>
            </div>
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-success-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900 dark:text-white">
                {upcomingMeetings.length}
              </p>
              <p className="text-sm text-secondary-500">Upcoming Meetings</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Documents List */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700 flex items-center justify-between">
              <h3 className="font-semibold text-secondary-900 dark:text-white">Documents</h3>
              <Link to="/" className="text-sm text-primary-600 hover:text-primary-700">
                View all
              </Link>
            </div>

            {documents.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="w-10 h-10 text-secondary-400 mx-auto mb-3" />
                <p className="text-secondary-600 dark:text-secondary-400">
                  No documents yet. Create your first document to get started.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-secondary-100 dark:divide-secondary-700">
                {documents.map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/documents/${doc.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-secondary-900 dark:text-white truncate">
                          {doc.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <DocumentTypeBadge type={doc.doc_type} />
                          <span className="text-xs text-secondary-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(doc.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-secondary-400 group-hover:text-primary-600 transition-colors" />
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
            <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-700">
              <h3 className="font-semibold text-secondary-900 dark:text-white text-sm">
                Pending Amendments
              </h3>
            </div>
            {recentAmendments.length === 0 ? (
              <div className="p-4 text-center text-sm text-secondary-500">
                No pending amendments
              </div>
            ) : (
              <div className="divide-y divide-secondary-100 dark:divide-secondary-700">
                {recentAmendments.map((amendment) => (
                  <Link
                    key={amendment.id}
                    to={`/amendments/${amendment.id}`}
                    className="block px-4 py-3 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-secondary-900 dark:text-white truncate">
                        {amendment.title}
                      </span>
                      <StatusBadge status={amendment.status} />
                    </div>
                    {amendment.description && (
                      <p className="text-xs text-secondary-500 line-clamp-1">
                        {amendment.description}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Meetings */}
          <div className="card">
            <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-700">
              <h3 className="font-semibold text-secondary-900 dark:text-white text-sm">
                Upcoming Meetings
              </h3>
            </div>
            {upcomingMeetings.length === 0 ? (
              <div className="p-4 text-center text-sm text-secondary-500">
                No upcoming meetings
              </div>
            ) : (
              <div className="divide-y divide-secondary-100 dark:divide-secondary-700">
                {upcomingMeetings.map((meeting) => (
                  <Link
                    key={meeting.id}
                    to={`/bylawyer-meetings/${meeting.id}`}
                    className="block px-4 py-3 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-secondary-900 dark:text-white">
                        {meeting.title}
                      </span>
                      <MeetingTypeBadge type={meeting.meeting_type} />
                    </div>
                    <p className="text-xs text-secondary-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(meeting.scheduled_date).toLocaleDateString()}
                      {meeting.location && ` - ${meeting.location}`}
                    </p>
                  </Link>
                ))}
              </div>
            )}
            <div className="px-4 py-2 border-t border-secondary-200 dark:border-secondary-700">
              <Link
                to="/bylawyer-meetings"
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                View all meetings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
