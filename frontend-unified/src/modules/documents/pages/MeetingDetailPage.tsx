import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ChevronRight, Clock, MapPin, Edit2, Play, CheckCircle,
  XCircle, Plus, ThumbsUp, AlertCircle
} from 'lucide-react'
import {
  meetings as meetingsApi,
  votes as votesApi,
  documents as documentsApi,
  amendments as amendmentsApi,
  Meeting,
  MeetingUpdate,
  Vote as VoteType,
  VoteCreate,
  Document,
  Amendment,
} from '../../../api/client'
import { useOrganization } from '../../../context/OrganizationContext'
import { LoadingPage } from '../../../components/ui/LoadingSpinner'
import { MeetingTypeBadge, StatusBadge } from '../../../components/ui/Badge'
import Modal from '../../../components/ui/Modal'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { useToast } from '../../../context/ToastContext'

export default function MeetingDetailPage() {
  const { meetingId } = useParams<{ meetingId: string }>()
  const { currentOrganization } = useOrganization()
  const { showToast } = useToast()

  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [votes, setVotes] = useState<VoteType[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [proposedAmendments, setProposedAmendments] = useState<Amendment[]>([])
  const [allAmendments, setAllAmendments] = useState<Amendment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editType, setEditType] = useState<Meeting['meeting_type']>('regular')
  const [editDate, setEditDate] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Vote recording modal
  const [voteModalOpen, setVoteModalOpen] = useState(false)
  const [selectedAmendment, setSelectedAmendment] = useState<Amendment | null>(null)
  const [yeaCount, setYeaCount] = useState(0)
  const [nayCount, setNayCount] = useState(0)
  const [abstainCount, setAbstainCount] = useState(0)
  const [recordingVote, setRecordingVote] = useState(false)

  // Status change dialogs
  const [startDialogOpen, setStartDialogOpen] = useState(false)
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)

  const fetchMeeting = useCallback(async () => {
    if (!meetingId || !currentOrganization) return

    try {
      setLoading(true)
      setError(null)
      const [mtg, vts, docs] = await Promise.all([
        meetingsApi.get(meetingId),
        votesApi.list(meetingId),
        documentsApi.list(currentOrganization.id),
      ])

      setMeeting(mtg)
      setVotes(vts)
      setDocuments(docs)

      // Fetch all amendments from all documents (for both proposed and voted)
      const all: Amendment[] = []
      const proposed: Amendment[] = []
      for (const doc of docs) {
        try {
          const amends = await amendmentsApi.list(doc.id)
          all.push(...amends)
          proposed.push(...amends.filter(a => a.status === 'proposed'))
        } catch {
          // Ignore
        }
      }
      setAllAmendments(all)
      setProposedAmendments(proposed)
    } catch (err) {
      setError('Failed to load meeting')
      showToast('error', 'Failed to load meeting')
    } finally {
      setLoading(false)
    }
  }, [meetingId, currentOrganization, showToast])

  useEffect(() => {
    fetchMeeting()
  }, [fetchMeeting])

  const handleEditMeeting = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!meeting) return

    try {
      setSaving(true)
      const data: MeetingUpdate = {
        title: editTitle.trim(),
        meeting_type: editType,
        scheduled_date: editDate,
        location: editLocation.trim() || undefined,
        notes: editNotes.trim() || undefined,
      }
      await meetingsApi.update(meeting.id, data)
      await fetchMeeting()
      setEditModalOpen(false)
      showToast('success', 'Meeting updated')
    } catch (err) {
      showToast('error', 'Failed to update meeting')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (newStatus: Meeting['status']) => {
    if (!meeting) return

    try {
      setStatusLoading(true)
      await meetingsApi.update(meeting.id, { status: newStatus })
      await fetchMeeting()
      setStartDialogOpen(false)
      setCompleteDialogOpen(false)
      setCancelDialogOpen(false)
      showToast('success', `Meeting ${newStatus === 'in_progress' ? 'started' : newStatus}`)
    } catch (err) {
      showToast('error', 'Failed to update meeting status')
    } finally {
      setStatusLoading(false)
    }
  }

  const handleRecordVote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!meeting || !selectedAmendment) return

    try {
      setRecordingVote(true)
      const data: VoteCreate = {
        amendment_id: selectedAmendment.id,
        yea_count: yeaCount,
        nay_count: nayCount,
        abstain_count: abstainCount,
      }
      const result = await votesApi.create(meeting.id, data)
      await fetchMeeting()
      setVoteModalOpen(false)
      resetVoteForm()

      const passed = result.passed
      showToast(
        passed ? 'success' : 'info',
        `Vote recorded: Amendment ${passed ? 'PASSED' : 'FAILED'} (${yeaCount}-${nayCount})`
      )
    } catch (err) {
      showToast('error', 'Failed to record vote')
    } finally {
      setRecordingVote(false)
    }
  }

  const resetVoteForm = () => {
    setSelectedAmendment(null)
    setYeaCount(0)
    setNayCount(0)
    setAbstainCount(0)
  }

  const openEditModal = () => {
    if (meeting) {
      setEditTitle(meeting.title)
      setEditType(meeting.meeting_type)
      setEditDate(meeting.scheduled_date.slice(0, 16)) // Format for datetime-local
      setEditLocation(meeting.location || '')
      setEditNotes(meeting.notes || '')
      setEditModalOpen(true)
    }
  }

  const getAmendmentTitle = (amendmentId: string) => {
    // First check in all amendments (including passed/failed)
    const amendment = allAmendments.find(a => a.id === amendmentId)
    if (amendment) return amendment.title
    return 'Unknown Amendment'
  }

  const getDocumentTitle = (amendmentId: string) => {
    const amendment = allAmendments.find(a => a.id === amendmentId)
    if (amendment) {
      const doc = documents.find(d => d.id === amendment.document_id)
      return doc?.title || 'Unknown Document'
    }
    return 'Unknown Document'
  }

  // Filter amendments that haven't been voted on in this meeting
  const unvotedAmendments = proposedAmendments.filter(
    a => !votes.some(v => v.amendment_id === a.id)
  )

  if (loading) {
    return <LoadingPage />
  }

  if (error || !meeting) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-danger-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-2">
          {error || 'Meeting not found'}
        </h2>
        <Link to="/bylawyer-meetings" className="text-primary-600 hover:text-primary-700">
          Return to meetings
        </Link>
      </div>
    )
  }

  const isScheduled = meeting.status === 'scheduled'
  const isInProgress = meeting.status === 'in_progress'
  const isCompleted = meeting.status === 'completed'
  const isCancelled = meeting.status === 'cancelled'

  const statusColors: Record<string, string> = {
    scheduled: 'bg-primary-100 text-primary-700',
    in_progress: 'bg-accent-100 text-accent-700',
    completed: 'bg-success-100 text-success-700',
    cancelled: 'bg-secondary-200 text-secondary-600',
  }

  const statusLabels: Record<string, string> = {
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-secondary-500 mb-1">
          <Link to="/" className="hover:text-primary-600">
            {currentOrganization?.name}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <Link to="/bylawyer-meetings" className="hover:text-primary-600">
            Meetings
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span>{meeting.title}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-heading font-bold text-secondary-900 dark:text-white">
              {meeting.title}
            </h2>
            <MeetingTypeBadge type={meeting.meeting_type} />
            <span className={`badge ${statusColors[meeting.status]}`}>
              {statusLabels[meeting.status]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isCancelled && !isCompleted && (
              <button onClick={openEditModal} className="btn-ghost btn-sm">
                <Edit2 className="w-4 h-4 mr-1" />
                Edit
              </button>
            )}
            {isScheduled && (
              <>
                <button onClick={() => setCancelDialogOpen(true)} className="btn-ghost btn-sm text-danger-600">
                  <XCircle className="w-4 h-4 mr-1" />
                  Cancel
                </button>
                <button onClick={() => setStartDialogOpen(true)} className="btn-primary btn-sm">
                  <Play className="w-4 h-4 mr-1" />
                  Start Meeting
                </button>
              </>
            )}
            {isInProgress && (
              <button onClick={() => setCompleteDialogOpen(true)} className="btn-success btn-sm">
                <CheckCircle className="w-4 h-4 mr-1" />
                Complete Meeting
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Meeting details */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-secondary-500 uppercase font-medium mb-1">Date & Time</p>
            <p className="flex items-center gap-1 text-secondary-900 dark:text-white">
              <Clock className="w-4 h-4 text-secondary-400" />
              {new Date(meeting.scheduled_date).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-secondary-500 uppercase font-medium mb-1">Location</p>
            <p className="flex items-center gap-1 text-secondary-900 dark:text-white">
              <MapPin className="w-4 h-4 text-secondary-400" />
              {meeting.location || 'Not specified'}
            </p>
          </div>
          <div>
            <p className="text-xs text-secondary-500 uppercase font-medium mb-1">Type</p>
            <MeetingTypeBadge type={meeting.meeting_type} />
          </div>
          <div>
            <p className="text-xs text-secondary-500 uppercase font-medium mb-1">Votes Recorded</p>
            <p className="flex items-center gap-1 text-secondary-900 dark:text-white">
              <ThumbsUp className="w-4 h-4 text-secondary-400" />
              {votes.length}
            </p>
          </div>
        </div>
        {meeting.notes && (
          <div className="mt-4 pt-4 border-t border-secondary-200 dark:border-secondary-700">
            <p className="text-xs text-secondary-500 uppercase font-medium mb-1">Notes</p>
            <p className="text-secondary-700 dark:text-secondary-300">{meeting.notes}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recorded Votes */}
        <div className="card">
          <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-700">
            <h3 className="font-semibold text-secondary-900 dark:text-white">
              Recorded Votes ({votes.length})
            </h3>
          </div>
          {votes.length === 0 ? (
            <div className="p-6 text-center text-sm text-secondary-500">
              No votes recorded yet
            </div>
          ) : (
            <div className="divide-y divide-secondary-100 dark:divide-secondary-700">
              {votes.map((vote) => (
                <div key={vote.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-secondary-900 dark:text-white">
                      {getAmendmentTitle(vote.amendment_id)}
                    </span>
                    <span className={`badge ${vote.passed ? 'badge-passed' : 'badge-failed'}`}>
                      {vote.passed ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                  <p className="text-xs text-secondary-500 mb-2">
                    {getDocumentTitle(vote.amendment_id)}
                  </p>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-success-600">
                      Yea: {vote.yea_count}
                    </span>
                    <span className="text-danger-600">
                      Nay: {vote.nay_count}
                    </span>
                    <span className="text-secondary-500">
                      Abstain: {vote.abstain_count}
                    </span>
                  </div>
                  <p className="text-xs text-secondary-400 mt-2">
                    Recorded: {new Date(vote.recorded_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Votes */}
        <div className="card">
          <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-700 flex items-center justify-between">
            <h3 className="font-semibold text-secondary-900 dark:text-white">
              Pending Amendments ({unvotedAmendments.length})
            </h3>
            {isInProgress && unvotedAmendments.length > 0 && (
              <button
                onClick={() => {
                  setSelectedAmendment(unvotedAmendments[0])
                  setVoteModalOpen(true)
                }}
                className="btn-primary btn-sm"
              >
                <Plus className="w-4 h-4 mr-1" />
                Record Vote
              </button>
            )}
          </div>
          {unvotedAmendments.length === 0 ? (
            <div className="p-6 text-center text-sm text-secondary-500">
              {proposedAmendments.length === 0
                ? 'No proposed amendments available to vote on'
                : 'All proposed amendments have been voted on'}
            </div>
          ) : (
            <div className="divide-y divide-secondary-100 dark:divide-secondary-700">
              {unvotedAmendments.map((amendment) => (
                <div
                  key={amendment.id}
                  className={`p-4 ${isInProgress ? 'hover:bg-secondary-50 dark:hover:bg-secondary-800/50 cursor-pointer' : ''}`}
                  onClick={() => {
                    if (isInProgress) {
                      setSelectedAmendment(amendment)
                      setVoteModalOpen(true)
                    }
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-secondary-900 dark:text-white">
                      {amendment.title}
                    </span>
                    <StatusBadge status={amendment.status} />
                  </div>
                  <p className="text-xs text-secondary-500 mb-1">
                    {documents.find(d => d.id === amendment.document_id)?.title}
                  </p>
                  {amendment.description && (
                    <p className="text-xs text-secondary-400 line-clamp-2">
                      {amendment.description}
                    </p>
                  )}
                  <p className="text-xs text-secondary-400 mt-1">
                    {amendment.changes?.length || 0} change(s)
                  </p>
                </div>
              ))}
            </div>
          )}

          {!isInProgress && unvotedAmendments.length > 0 && (
            <div className="px-4 py-3 bg-secondary-50 dark:bg-secondary-800/50 text-sm text-secondary-600 dark:text-secondary-400">
              Start the meeting to record votes on amendments.
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Meeting">
        <form onSubmit={handleEditMeeting}>
          <div className="mb-4">
            <label className="label">Title</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="input"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Type</label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value as Meeting['meeting_type'])}
                className="select"
              >
                <option value="regular">Regular</option>
                <option value="special">Special</option>
                <option value="annual">Annual</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label className="label">Date & Time</label>
              <input
                type="datetime-local"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="input"
                required
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Location</label>
            <input
              type="text"
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
              className="input"
              placeholder="e.g., Conference Room A"
            />
          </div>
          <div className="mb-6">
            <label className="label">Notes</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="textarea h-24"
              placeholder="Meeting notes or agenda..."
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditModalOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!editTitle.trim() || saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Vote Recording Modal */}
      <Modal
        isOpen={voteModalOpen}
        onClose={() => { setVoteModalOpen(false); resetVoteForm(); }}
        title="Record Vote"
      >
        <form onSubmit={handleRecordVote}>
          <div className="mb-4">
            <label className="label">Amendment</label>
            <select
              value={selectedAmendment?.id || ''}
              onChange={(e) => {
                const amend = unvotedAmendments.find(a => a.id === e.target.value)
                setSelectedAmendment(amend || null)
              }}
              className="select"
              required
            >
              <option value="">Select amendment...</option>
              {unvotedAmendments.map((a) => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
          </div>

          {selectedAmendment && (
            <div className="mb-4 p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
              <p className="text-xs text-secondary-500 mb-1">
                {documents.find(d => d.id === selectedAmendment.document_id)?.title}
              </p>
              <p className="text-sm text-secondary-600 dark:text-secondary-400">
                {selectedAmendment.description || 'No description'}
              </p>
              <p className="text-xs text-secondary-400 mt-2">
                {selectedAmendment.changes?.length || 0} proposed change(s)
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="label text-success-600">Yea</label>
              <input
                type="number"
                min="0"
                value={yeaCount}
                onChange={(e) => setYeaCount(parseInt(e.target.value) || 0)}
                className="input text-center text-lg font-bold"
              />
            </div>
            <div>
              <label className="label text-danger-600">Nay</label>
              <input
                type="number"
                min="0"
                value={nayCount}
                onChange={(e) => setNayCount(parseInt(e.target.value) || 0)}
                className="input text-center text-lg font-bold"
              />
            </div>
            <div>
              <label className="label text-secondary-500">Abstain</label>
              <input
                type="number"
                min="0"
                value={abstainCount}
                onChange={(e) => setAbstainCount(parseInt(e.target.value) || 0)}
                className="input text-center text-lg font-bold"
              />
            </div>
          </div>

          <div className="mb-6 p-4 bg-secondary-100 dark:bg-secondary-700 rounded-lg text-center">
            <p className="text-sm text-secondary-600 dark:text-secondary-400 mb-1">
              Total votes: {yeaCount + nayCount + abstainCount}
            </p>
            <p className={`text-2xl font-bold ${yeaCount > nayCount ? 'text-success-600' : yeaCount < nayCount ? 'text-danger-600' : 'text-secondary-600'}`}>
              {yeaCount > nayCount ? 'PASSING' : yeaCount < nayCount ? 'FAILING' : 'TIE'}
            </p>
            {yeaCount === nayCount && yeaCount > 0 && (
              <p className="text-xs text-secondary-500 mt-1">
                Ties typically fail (simple majority required)
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setVoteModalOpen(false); resetVoteForm(); }} className="btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!selectedAmendment || recordingVote}
            >
              {recordingVote ? 'Recording...' : 'Record Vote'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Status change dialogs */}
      <ConfirmDialog
        isOpen={startDialogOpen}
        onClose={() => setStartDialogOpen(false)}
        onConfirm={() => handleStatusChange('in_progress')}
        title="Start Meeting"
        message="Are you ready to start this meeting? You'll be able to record votes on proposed amendments."
        confirmText="Start Meeting"
        loading={statusLoading}
      />

      <ConfirmDialog
        isOpen={completeDialogOpen}
        onClose={() => setCompleteDialogOpen(false)}
        onConfirm={() => handleStatusChange('completed')}
        title="Complete Meeting"
        message="Are you sure you want to mark this meeting as completed? Make sure all votes have been recorded."
        confirmText="Complete Meeting"
        loading={statusLoading}
      />

      <ConfirmDialog
        isOpen={cancelDialogOpen}
        onClose={() => setCancelDialogOpen(false)}
        onConfirm={() => handleStatusChange('cancelled')}
        title="Cancel Meeting"
        message="Are you sure you want to cancel this meeting? This action cannot be undone."
        confirmText="Cancel Meeting"
        variant="danger"
        loading={statusLoading}
      />
    </div>
  )
}
