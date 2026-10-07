import { Link } from 'react-router-dom';
import { ChevronRight, Edit2, Play, CheckCircle, XCircle } from 'lucide-react';
import { Meeting } from '../../../../api/client';
import { MeetingTypeBadge } from '../../../../components/ui/Badge';

interface MeetingHeaderProps {
  meeting: Meeting;
  organizationName?: string;
  /** Whether the user may change the record (secretary and above) */
  canManage: boolean;
  onEdit: () => void;
  onStart: () => void;
  onComplete: () => void;
  onCancel: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-gavel-tint text-ink',
  in_progress: 'bg-caution-tint text-caution-ink',
  completed: 'bg-carried-tint text-carried',
  cancelled: 'bg-surface-2 text-ink-muted',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function MeetingHeader({
  meeting,
  organizationName,
  canManage,
  onEdit,
  onStart,
  onComplete,
  onCancel,
}: MeetingHeaderProps) {
  const isScheduled = meeting.status === 'scheduled';
  const isInProgress = meeting.status === 'in_progress';
  const isCompleted = meeting.status === 'completed';
  const isCancelled = meeting.status === 'cancelled';

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-sm text-ink-muted mb-1">
        <Link to="/" className="hover:text-gavel">
          {organizationName}
        </Link>
        <ChevronRight className="w-4 h-4" />
        <Link to="/bylawyer-meetings" className="hover:text-gavel">
          Meetings
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span>{meeting.title}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="page-title">{meeting.title}</h2>
          <MeetingTypeBadge type={meeting.meetingType} />
          <span className={`badge ${STATUS_COLORS[meeting.status]}`}>
            {STATUS_LABELS[meeting.status]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canManage && !isCancelled && !isCompleted && (
            <button onClick={onEdit} className="btn-ghost btn-sm">
              <Edit2 className="w-4 h-4 mr-1" />
              Edit
            </button>
          )}
          {canManage && isScheduled && (
            <>
              <button onClick={onCancel} className="btn-ghost btn-sm text-gavel">
                <XCircle className="w-4 h-4 mr-1" />
                Cancel
              </button>
              <button onClick={onStart} className="btn-primary btn-sm">
                <Play className="w-4 h-4 mr-1" />
                Start Meeting
              </button>
            </>
          )}
          {canManage && isInProgress && (
            <button onClick={onComplete} className="btn-success btn-sm">
              <CheckCircle className="w-4 h-4 mr-1" />
              Complete Meeting
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
