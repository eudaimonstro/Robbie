import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarPlus, RefreshCw } from 'lucide-react';
import { schedule, type ScheduledMeeting } from '../../../api/client';
import { useSession } from '../../../context/SessionContext';
import { atLeast } from '../../../utils/roles';
import { formatMeetingTime } from '../../../utils/dates';
import { useMeetingOrganization } from '../context/OrganizationBridge';
import { MeetingScheduler } from '../components/scheduling';
import { meetingPath } from '../utils/meetingLinks';
import { JoinMeetingScreen } from './JoinMeetingScreen';
import { QuorumNotSet } from '../../../components/organizations/QuorumNotSet';
import { quorumIsSet } from '../../../utils/quorum';

/** The schedule as loaded, for the organization it belongs to */
type Loaded =
  | { organizationId: string; meetings: ScheduledMeeting[] }
  | { organizationId: string; failed: true };

/**
 * The Live Meetings page: the current organization's schedule, each meeting with a way in (Start
 * for its presiding officer, Join for everyone else), the meetings already held, the code box
 * for anyone with a code, and for secretaries and above Schedule a meeting and Change on each
 * meeting not yet called to order
 */
export function LiveMeetingsPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { currentOrganization } = useMeetingOrganization();
  const organizationId = currentOrganization?.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [scheduling, setScheduling] = useState(false);
  // The meeting being changed, by its code, and what the last change came to
  const [changing, setChanging] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Bumped when the scheduler closes, so a meeting just scheduled is listed
  const [refresh, setRefresh] = useState(0);
  // Where the focus goes when the scheduler closes: what happened, or back where it was opened
  // (the Change of that meeting, or Schedule a meeting), never the top of the page
  const returnFocus = useRef<{ code: string | null } | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const scheduleRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
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
      .catch(() => {
        // Said in words, with Try again: the server's message ("Failed to list meeting
        // packets") means nothing to the person reading it
        if (!canceled) setLoaded({ organizationId, failed: true });
      });
    return () => {
      canceled = true;
    };
  }, [organizationId, refresh]);

  const open = scheduling || changing !== null;
  useLayoutEffect(() => {
    const target = returnFocus.current;
    if (open || !target) return;
    returnFocus.current = null;
    const change = target.code
      ? listRef.current?.querySelector<HTMLButtonElement>(`button[data-change="${target.code}"]`)
      : null;
    (status ? statusRef.current : (change ?? scheduleRef.current))?.focus();
  }, [open, status]);

  if (scheduling || changing) {
    return (
      <MeetingScheduler
        key={changing ?? 'new'}
        meetingCode={changing ?? undefined}
        onBack={(message) => {
          returnFocus.current = { code: changing };
          setScheduling(false);
          setChanging(null);
          setStatus(message ?? null);
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
          <button
            ref={scheduleRef}
            type="button"
            className="btn-primary"
            onClick={() => {
              setStatus(null);
              setScheduling(true);
            }}
          >
            <CalendarPlus className="w-5 h-5" aria-hidden="true" />
            Schedule a meeting
          </button>
        )}
      </div>

      {/* Always there, so a screen reader hears it when it is filled in */}
      <p
        ref={statusRef}
        role="status"
        tabIndex={-1}
        className={
          status
            ? 'mb-6 rounded-lg bg-surface-2 px-4 py-3 text-sm text-ink focus:outline-none'
            : 'sr-only'
        }
      >
        {status}
      </p>

      <div ref={listRef} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {currentOrganization && (
            <section className="card" aria-labelledby="schedule-heading">
              <h3 id="schedule-heading" className="label-caps px-6 pt-5 pb-3">
                Schedule
              </h3>
              {current && 'failed' in current ? (
                <div role="alert" className="flex flex-wrap items-center gap-3 px-6 pb-5">
                  <p className="text-sm text-ink">Couldn&apos;t load the schedule.</p>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setLoaded(null);
                      setRefresh((n) => n + 1);
                    }}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Try again
                  </button>
                </div>
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
                      timeZone={currentOrganization?.timeZone}
                      presiding={meeting.chairUserId !== null && meeting.chairUserId === user?.id}
                      quorumSet={quorumIsSet(currentOrganization)}
                      canSetQuorum={atLeast(currentOrganization.role, 'admin')}
                      onChange={
                        // Changed until the call to order; after it, in the meeting
                        canSchedule && !meeting.startedAt
                          ? () => {
                              setStatus(null);
                              setChanging(meeting.robbieCode);
                            }
                          : undefined
                      }
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
                  <ScheduleRow
                    key={meeting.id}
                    meeting={meeting}
                    timeZone={currentOrganization?.timeZone}
                    presiding={false}
                    quorumSet
                  />
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

/**
 * One scheduled meeting: its title, date, presiding officer and code, the way in, and Change when
 * it can be changed
 */
function ScheduleRow({
  meeting,
  timeZone,
  presiding,
  quorumSet,
  canSetQuorum = false,
  onChange,
}: {
  meeting: ScheduledMeeting;
  /** The organization's: a meeting's time is the time in the room */
  timeZone?: string;
  presiding: boolean;
  /**
   * Whether the organization set its voting members and quorum: until then the server won't
   * open a meeting not yet called to order, so it has no way in, only the way to set them
   */
  quorumSet: boolean;
  /** An admin, who sets them */
  canSetQuorum?: boolean;
  onChange?: () => void;
}) {
  const title = meeting.title || 'Untitled meeting';
  const inSession = meeting.startedAt !== null && meeting.endedAt === null;
  // The presiding officer starts a meeting not yet called to order; everyone else joins it.
  // Starting only opens it: the chair calls the meeting to order from the console.
  const action = meeting.endedAt ? 'Open' : presiding && !meeting.startedAt ? 'Start' : 'Join';
  // As the server decides: a meeting already open (a live state) goes on
  const closed = !quorumSet && !meeting.startedAt && !meeting.open;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <div className="min-w-0">
        <p className="font-medium text-ink">{title}</p>
        <p className="text-sm text-ink-muted">
          <span>
            {meeting.scheduledFor
              ? formatMeetingTime(meeting.scheduledFor, timeZone)
              : 'No date set'}
          </span>
          {meeting.chair?.name && <span>{`, ${meeting.chair.name} presiding`}</span>}
        </p>
        {closed && <QuorumNotSet canSet={canSetQuorum} className="mt-1" />}
      </div>
      <div className="flex items-center gap-3">
        {inSession && <span className="badge-present">In session</span>}
        <span className="meeting-code text-sm text-ink-muted">{meeting.robbieCode}</span>
        {onChange && (
          <button
            type="button"
            onClick={onChange}
            aria-label={`Change ${title}`}
            data-change={meeting.robbieCode}
            className="btn-ghost btn-sm"
          >
            Change
          </button>
        )}
        {!closed && (
          <Link
            to={meetingPath(meeting.robbieCode)}
            aria-label={`${action} ${title}`}
            className={action === 'Start' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          >
            {action}
          </Link>
        )}
      </div>
    </li>
  );
}
