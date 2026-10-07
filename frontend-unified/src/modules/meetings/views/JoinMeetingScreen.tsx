import { useState, type FormEvent } from 'react';
import { Calendar, Gavel, Hash } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { MeetingScheduler } from '../components/scheduling';
import { useMeetingOrganization } from '../context/OrganizationBridge';
import { atLeast } from '../../../utils/roles';

const MEETING_CODE = /^[A-Z0-9]{4,8}$/;

/** Join a live meeting by its code, or schedule a new one */
export function JoinMeetingScreen() {
  const { joinMeeting, error } = useSocket();
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const { currentOrganization } = useMeetingOrganization();
  // Meetings are scheduled in the current organization, by its secretaries and above
  const canSchedule =
    currentOrganization !== null && atLeast(currentOrganization.role, 'secretary');

  if (scheduling) {
    return (
      <MeetingScheduler onBack={() => setScheduling(false)} onJoinMeeting={(c) => joinMeeting(c)} />
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!MEETING_CODE.test(normalized)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    joinMeeting(normalized);
  };

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-6">
          <Gavel className="w-6 h-6 text-meeting-600" aria-hidden="true" />
          <h2 className="text-xl font-heading font-bold text-secondary-900 dark:text-white">
            Join a Meeting
          </h2>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="meetingCode" className="label">
              Meeting code
            </label>
            <div className="relative">
              <Hash
                className="w-4 h-4 absolute left-3 top-3 text-secondary-400"
                aria-hidden="true"
              />
              <input
                id="meetingCode"
                className="input pl-9 uppercase tracking-widest"
                autoComplete="off"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            {invalid && (
              <p role="alert" className="mt-1 text-sm text-danger-600">
                Meeting codes are 4 to 8 letters or digits
              </p>
            )}
          </div>
          <button type="submit" className="btn-primary w-full">
            Join meeting
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger-600">
            {error}
          </p>
        )}
        {canSchedule && (
          <div className="mt-6 pt-6 border-t border-secondary-200 dark:border-secondary-700">
            <button onClick={() => setScheduling(true)} className="btn-secondary w-full">
              <Calendar className="w-4 h-4 mr-2" aria-hidden="true" />
              Schedule a New Meeting
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
