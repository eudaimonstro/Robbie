import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import { schedule, type ScheduledMeeting } from '../../../api/client';
import { useSession } from '../../../context/SessionContext';
import { atLeast } from '../../../utils/roles';
import { formatMeetingTime } from '../../../utils/dates';
import { useMeetingOrganization } from '../context/OrganizationBridge';
import { MeetingScheduler } from '../components/scheduling';
import { meetingPath } from '../utils/meetingLinks';
import { JoinMeetingScreen } from './JoinMeetingScreen';

/** The schedule as loaded, for the organization it belongs to */
type Loaded =
  | { organizationId: string; meetings: ScheduledMeeting[] }
  | { organizationId: string; error: string };

/**
 * The Live Meetings page: the current organization's schedule, each meeting with a way in (Start
 * for its presiding officer, Join for everyone else), the meetings already held, the code box
 * for anyone with a code, and Schedule a meeting for secretaries and above
 */
export function LiveMeetingsPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { currentOrganization } = useMeetingOrganization();
  const organizationId = currentOrganization?.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [scheduling, setScheduling] = useState(false);
  // Bumped when the scheduler closes, so a meeting just scheduled is listed
  const [refresh, setRefresh] = useState(0);
  // Meetings are scheduled in the current organization, by its secretaries and above
  const canSchedule =
    currentOrganization !== null && atLeast(currentOrganization.role, 'secretary');

  useEffect(() => {
    if (!organizationId) return;
    let canceled = false;
    schedule
      .list(organizationId)
      .then((meetings) => {
        if (!canceled) setLoaded({ organizationId, meetings });
      })
      .catch((err: unknown) => {
        if (!canceled) {
          const error = err instanceof Error ? err.message : "Couldn't load the schedule";
          setLoaded({ organizationId, error });
        }
      });
    return () => {
      canceled = true;
    };
  }, [organizationId, refresh]);

  if (scheduling) {
    return (
      <MeetingScheduler
        onBack={() => {
          setScheduling(false);
          setRefresh((n) => n + 1);
        }}
        onJoinMeeting={(code) => navigate(meetingPath(code))}
      />
    );
  }

  // A schedule loaded for another organization (the header switched) is not shown
  const current = loaded?.organizationId === organizationId ? loaded : null;
  const meetings = current && 'meetings' in current ? current.meetings : null;
  const upcoming = meetings?.filter((m) => !m.endedAt) ?? [];
  const held = meetings?.filter((m) => m.endedAt) ?? [];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="page-title">Live meetings</h2>
          <p className="text-ink-muted mt-1">
            {currentOrganization
              ? `Meetings of ${currentOrganization.name}`
              : 'Join a meeting with its code'}
          </p>
        </div>
        {canSchedule && (
          <button type="button" className="btn-primary" onClick={() => setScheduling(true)}>
            <CalendarPlus className="w-5 h-5" aria-hidden="true" />
            Schedule a meeting
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {currentOrganization && (
            <section className="card" aria-labelledby="schedule-heading">
              <h3 id="schedule-heading" className="label-caps px-6 pt-5 pb-3">
                Schedule
              </h3>
              {current && 'error' in current ? (
                <p role="alert" className="px-6 pb-5 text-sm text-gavel">
                  {current.error}
                </p>
              ) : meetings === null ? (
                <p className="px-6 pb-5 text-sm text-ink-muted">Loading the schedule...</p>
              ) : upcoming.length === 0 ? (
                <p className="px-6 pb-5 text-sm text-ink-muted">No meetings scheduled.</p>
              ) : (
                <ul className="border-t border-rule divide-y divide-rule">
                  {upcoming.map((meeting) => (
                    <ScheduleRow
                      key={meeting.id}
                      meeting={meeting}
                      presiding={meeting.chairUserId !== null && meeting.chairUserId === user?.id}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {held.length > 0 && (
            <section className="card" aria-labelledby="held-heading">
              <h3 id="held-heading" className="label-caps px-6 pt-5 pb-3">
                Held
              </h3>
              <ul className="border-t border-rule divide-y divide-rule">
                {held.map((meeting) => (
                  <ScheduleRow key={meeting.id} meeting={meeting} presiding={false} />
                ))}
              </ul>
            </section>
          )}
        </div>

        <JoinMeetingScreen />
      </div>
    </div>
  );
}

/** One scheduled meeting: its title, date, presiding officer and code, and the way in */
function ScheduleRow({ meeting, presiding }: { meeting: ScheduledMeeting; presiding: boolean }) {
  const title = meeting.title || 'Untitled meeting';
  const inSession = meeting.startedAt !== null && meeting.endedAt === null;
  // The presiding officer starts a meeting not yet called to order; everyone else joins it.
  // Starting only opens it: the chair calls the meeting to order from the console.
  const action = meeting.endedAt ? 'Open' : presiding && !meeting.startedAt ? 'Start' : 'Join';

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <div className="min-w-0">
        <p className="font-medium text-ink">{title}</p>
        <p className="text-sm text-ink-muted">
          <span>
            {meeting.scheduledFor ? formatMeetingTime(meeting.scheduledFor) : 'No date set'}
          </span>
          {meeting.chair?.name && <span>{`, ${meeting.chair.name} presiding`}</span>}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {inSession && <span className="badge-present">In session</span>}
        <span className="meeting-code text-sm text-ink-muted">{meeting.robbieCode}</span>
        <Link
          to={meetingPath(meeting.robbieCode)}
          aria-label={`${action} ${title}`}
          className={action === 'Start' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
        >
          {action}
        </Link>
      </div>
    </li>
  );
}
