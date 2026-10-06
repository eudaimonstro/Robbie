import { Link } from 'react-router-dom';
import { ChevronRight, Edit2, Play, CheckCircle, XCircle } from 'lucide-react';
import { Meeting } from '../../../../api/client';
import { MeetingTypeBadge } from '../../../../components/ui/Badge';

interface MeetingHeaderProps {
  meeting: Meeting;
  organizationName?: string;
  onEdit: () => void;
  onStart: () => void;
  onComplete: () => void;
  onCancel: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-primary-100 text-primary-700',
  in_progress: 'bg-accent-100 text-accent-700',
  completed: 'bg-success-100 text-success-700',
  cancelled: 'bg-secondary-200 text-secondary-600',
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
      <div className="flex items-center gap-2 text-sm text-secondary-500 mb-1">
        <Link to="/" className="hover:text-primary-600">
          {organizationName}
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
          <span className={`badge ${STATUS_COLORS[meeting.status]}`}>
            {STATUS_LABELS[meeting.status]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isCancelled && !isCompleted && (
            <button onClick={onEdit} className="btn-ghost btn-sm">
              <Edit2 className="w-4 h-4 mr-1" />
              Edit
            </button>
          )}
          {isScheduled && (
            <>
              <button onClick={onCancel} className="btn-ghost btn-sm text-danger-600">
                <XCircle className="w-4 h-4 mr-1" />
                Cancel
              </button>
              <button onClick={onStart} className="btn-primary btn-sm">
                <Play className="w-4 h-4 mr-1" />
                Start Meeting
              </button>
            </>
          )}
          {isInProgress && (
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
