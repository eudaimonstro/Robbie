import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { VoteCreate, Amendment } from '../../../api/client';
import { useOrganization } from '../../../context/OrganizationContext';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { useToast } from '../../../context/ToastContext';
import {
  useMeetingData,
  MeetingHeader,
  MeetingDetailsCard,
  RecordedVotesPanel,
  PendingAmendmentsPanel,
  EditMeetingModal,
  VoteRecordingModal,
  MeetingStatusDialogs,
} from './meetingDetailPage';

export default function MeetingDetailPage() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const { currentOrganization } = useOrganization();
  const { showToast } = useToast();

  const {
    meeting,
    votes,
    documents,
    proposedAmendments,
    loading,
    error,
    updateMeeting,
    changeStatus,
    recordVote,
    getAmendmentTitle,
    getDocumentTitle,
  } = useMeetingData(meetingId, currentOrganization?.id);

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [voteModalOpen, setVoteModalOpen] = useState(false);
  const [selectedAmendment, setSelectedAmendment] = useState<Amendment | null>(null);

  // Status dialog states
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  // Filter amendments that haven't been voted on
  const unvotedAmendments = useMemo(
    () => proposedAmendments.filter((a) => !votes.some((v) => v.amendmentId === a.id)),
    [proposedAmendments, votes],
  );

  const handleEditSubmit = async (data: {
    title: string;
    type: typeof meeting extends null ? never : NonNullable<typeof meeting>['meetingType'];
    date: string;
    location?: string;
    notes?: string;
  }) => {
    await updateMeeting({
      title: data.title,
      meetingType: data.type,
      scheduledDate: data.date,
      location: data.location,
      notes: data.notes,
    });
  };

  const handleStatusChange = async (
    newStatus: 'scheduled' | 'in_progress' | 'completed' | 'cancelled',
  ) => {
    try {
      setStatusLoading(true);
      await changeStatus(newStatus);
      setStartDialogOpen(false);
      setCompleteDialogOpen(false);
      setCancelDialogOpen(false);
    } catch {
      showToast('error', 'Failed to update meeting status');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleRecordVote = async (data: VoteCreate) => {
    const result = await recordVote(data);
    showToast(
      result.passed ? 'success' : 'info',
      `Vote recorded: Amendment ${result.passed ? 'PASSED' : 'FAILED'}`,
    );
    return result;
  };

  const handleOpenVoteModal = (amendment: Amendment) => {
    setSelectedAmendment(amendment);
    setVoteModalOpen(true);
  };

  const handleCloseVoteModal = () => {
    setVoteModalOpen(false);
    setSelectedAmendment(null);
  };

  if (loading) {
    return <LoadingPage />;
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
    );
  }

  const isInProgress = meeting.status === 'in_progress';

  return (
    <div className="max-w-5xl mx-auto">
      <MeetingHeader
        meeting={meeting}
        organizationName={currentOrganization?.name}
        onEdit={() => setEditModalOpen(true)}
        onStart={() => setStartDialogOpen(true)}
        onComplete={() => setCompleteDialogOpen(true)}
        onCancel={() => setCancelDialogOpen(true)}
      />

      <MeetingDetailsCard meeting={meeting} votesCount={votes.length} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecordedVotesPanel
          votes={votes}
          getAmendmentTitle={getAmendmentTitle}
          getDocumentTitle={getDocumentTitle}
        />
        <PendingAmendmentsPanel
          amendments={unvotedAmendments}
          documents={documents}
          isInProgress={isInProgress}
          onRecordVote={handleOpenVoteModal}
        />
      </div>

      <EditMeetingModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSubmit={handleEditSubmit}
        meeting={meeting}
      />

      <VoteRecordingModal
        isOpen={voteModalOpen}
        onClose={handleCloseVoteModal}
        onSubmit={handleRecordVote}
        amendments={unvotedAmendments}
        documents={documents}
        selectedAmendment={selectedAmendment}
        onSelectAmendment={setSelectedAmendment}
      />

      <MeetingStatusDialogs
        startDialogOpen={startDialogOpen}
        completeDialogOpen={completeDialogOpen}
        cancelDialogOpen={cancelDialogOpen}
        loading={statusLoading}
        onStartClose={() => setStartDialogOpen(false)}
        onStartConfirm={() => handleStatusChange('in_progress')}
        onCompleteClose={() => setCompleteDialogOpen(false)}
        onCompleteConfirm={() => handleStatusChange('completed')}
        onCancelClose={() => setCancelDialogOpen(false)}
        onCancelConfirm={() => handleStatusChange('cancelled')}
      />
    </div>
  );
}
