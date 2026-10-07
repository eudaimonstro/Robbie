import { Clock, MapPin, ThumbsUp } from 'lucide-react';
import { Meeting } from '../../../../api/client';
import { MeetingTypeBadge } from '../../../../components/ui/Badge';

interface MeetingDetailsCardProps {
  meeting: Meeting;
  votesCount: number;
}

export function MeetingDetailsCard({ meeting, votesCount }: MeetingDetailsCardProps) {
  return (
    <div className="card p-4 mb-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-ink-muted uppercase font-medium mb-1">Date & Time</p>
          <p className="flex items-center gap-1 text-ink">
            <Clock className="w-4 h-4 text-ink-muted" />
            {new Date(meeting.scheduledDate).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-muted uppercase font-medium mb-1">Location</p>
          <p className="flex items-center gap-1 text-ink">
            <MapPin className="w-4 h-4 text-ink-muted" />
            {meeting.location || 'Not specified'}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-muted uppercase font-medium mb-1">Type</p>
          <MeetingTypeBadge type={meeting.meetingType} />
        </div>
        <div>
          <p className="text-xs text-ink-muted uppercase font-medium mb-1">Votes Recorded</p>
          <p className="flex items-center gap-1 text-ink">
            <ThumbsUp className="w-4 h-4 text-ink-muted" />
            {votesCount}
          </p>
        </div>
      </div>
      {meeting.notes && (
        <div className="mt-4 pt-4 border-t border-rule">
          <p className="text-xs text-ink-muted uppercase font-medium mb-1">Notes</p>
          <p className="text-ink">{meeting.notes}</p>
        </div>
      )}
    </div>
  );
}
