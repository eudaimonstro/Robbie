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
          <p className="text-xs text-secondary-500 uppercase font-medium mb-1">Date & Time</p>
          <p className="flex items-center gap-1 text-secondary-900 dark:text-white">
            <Clock className="w-4 h-4 text-secondary-400" />
            {new Date(meeting.scheduledDate).toLocaleString()}
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
          <MeetingTypeBadge type={meeting.meetingType} />
        </div>
        <div>
          <p className="text-xs text-secondary-500 uppercase font-medium mb-1">Votes Recorded</p>
          <p className="flex items-center gap-1 text-secondary-900 dark:text-white">
            <ThumbsUp className="w-4 h-4 text-secondary-400" />
            {votesCount}
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
  );
}
