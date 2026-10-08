import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ChevronRight, Building2, Calendar, MapPin } from 'lucide-react';
import { useOrganization, useCan } from '../../../context/OrganizationContext';
import { useSession } from '../../../context/SessionContext';
import {
  documents as documentsApi,
  amendments as amendmentsApi,
  schedule as scheduleApi,
  Document,
  Amendment,
  ScheduledMeeting,
} from '../../../api/client';
import { formatDate, formatMeetingTime } from '../../../utils/dates';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import { NoOrganizations } from '../../../components/organizations/NoOrganizations';
import { StatusBadge, DocumentTypeBadge } from '../../../components/ui/Badge';
import { SetupChecklist } from '../components/SetupChecklist';
import { QuorumNotSet } from '../../../components/organizations/QuorumNotSet';
import { quorumIsSet } from '../../../utils/quorum';

/** One part of the page as loaded: not yet, its data, or the failure */
type Part<T> = { data: T } | { failed: true } | null;

/** Load one part, keeping its failure to itself: the rest of the page still shows */
function settle<T>(promise: Promise<T>): Promise<Part<T>> {
  return promise.then(
    (data) => ({ data }),
    () => ({ failed: true }) as const,
  );
}

/**
 * Home: the organization's next meeting first (the reason most people open Robbie), then its
 * documents and the amendments not yet decided. Nothing that looks like a dashboard: no counts.
 */
export default function HomePage() {
  const { currentOrganization, organizations: orgs, loading: orgLoading } = useOrganization();
  const orgId = currentOrganization?.id;
  // Setting the organization up is the secretary's and the admins' work
  const canSetUp = useCan('secretary');
  const [documents, setDocuments] = useState<Part<Document[]>>(null);
  const [pending, setPending] = useState<Part<Amendment[]>>(null);
  const [meetings, setMeetings] = useState<Part<ScheduledMeeting[]>>(null);
  // Bumped by Try again
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!orgId) return;
    let canceled = false;
    setDocuments(null);
    setPending(null);
    setMeetings(null);
    void settle(documentsApi.list(orgId)).then((part) => !canceled && setDocuments(part));
    void settle(amendmentsApi.listForOrganization(orgId, ['draft', 'proposed'])).then(
      (part) => !canceled && setPending(part),
    );
    // The schedule lists the meetings not yet adjourned first, soonest first
    void settle(scheduleApi.list(orgId)).then((part) => !canceled && setMeetings(part));
    return () => {
      canceled = true;
    };
  }, [orgId, attempt]);

  if (orgLoading) return <LoadingPage label="Loading Robbie..." />;

  if (!currentOrganization) {
    if (orgs.length === 0) return <NoOrganizations />;
    return (
      <EmptyState
        icon={Building2}
        title="No organization selected"
        description="Choose an organization from the menu at the top of the page."
      />
    );
  }

  const timeZone = currentOrganization.timeZone;
  const upcoming =
    meetings && 'data' in meetings ? meetings.data.filter((m) => !m.endedAt).slice(0, 3) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h2 className="page-title">{currentOrganization.name}</h2>

      {canSetUp && documents && 'data' in documents && meetings && 'data' in meetings && (
        <SetupChecklist
          key={currentOrganization.id}
          organization={currentOrganization}
          documents={documents.data}
          meetings={meetings.data}
        />
      )}

      <NextMeeting
        part={meetings}
        upcoming={upcoming}
        timeZone={timeZone}
        onRetry={retry}
        quorumSet={quorumIsSet(currentOrganization)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Documents" className="lg:col-span-2">
          <DocumentsList part={documents} timeZone={timeZone} onRetry={retry} />
        </Card>

        <Card
          title="Pending amendments"
          footer={
            <Link
              to="/amendments"
              className="inline-flex min-h-11 items-center text-sm text-gavel hover:underline md:min-h-0"
            >
              All amendments
            </Link>
          }
        >
          <PendingList part={pending} onRetry={retry} />
        </Card>
      </div>
    </div>
  );
}

/** A titled card, named by its title for screen readers' list of regions */
function Card({
  title,
  className = '',
  footer,
  children,
}: {
  title: string;
  className?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const id = `home-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={id} className={`card ${className}`}>
      <h3 id={id} className="label-caps border-b border-rule px-5 py-3">
        {title}
      </h3>
      {children}
      {footer && <div className="border-t border-rule px-5 py-2">{footer}</div>}
    </section>
  );
}

function NextMeeting({
  part,
  upcoming,
  timeZone,
  onRetry,
  quorumSet,
}: {
  part: Part<ScheduledMeeting[]>;
  upcoming: ScheduledMeeting[] | null;
  timeZone?: string;
  onRetry: () => void;
  /** Whether the organization set its voting members and quorum: a meeting opens only then */
  quorumSet: boolean;
}) {
  const { user } = useSession();
  const canSetQuorum = useCan('admin');
  const [next, ...later] = upcoming ?? [];

  let body: ReactNode;
  if (!part) {
    body = <p className="px-5 py-4 text-sm text-ink-muted">Loading the schedule...</p>;
  } else if ('failed' in part) {
    body = <ErrorState inline title="Couldn't load the schedule." onRetry={onRetry} />;
  } else if (!next) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="text-sm text-ink-muted">No meeting is scheduled.</p>
        <Link to="/meetings" className="btn-secondary btn-sm">
          Join with a code
        </Link>
      </div>
    );
  } else {
    const title = next.title || 'Untitled meeting';
    // The presiding officer starts a meeting not yet called to order; everyone else joins it
    const action = next.chairUserId === user?.id && !next.startedAt ? 'Start' : 'Join';
    const inSession = next.startedAt !== null;
    body = (
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="card-title flex flex-wrap items-center gap-3">
              {title}
              {inSession && <span className="badge-present">In session</span>}
            </p>
            <p className="mt-1 flex items-center gap-2 text-ink">
              <Calendar className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
              {next.scheduledFor ? formatMeetingTime(next.scheduledFor, timeZone) : 'No date set'}
            </p>
            {next.location && (
              <p className="mt-1 flex items-center gap-2 text-ink">
                <MapPin className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                {next.location}
              </p>
            )}
            {next.chair?.name && (
              <p className="mt-1 text-sm text-ink-muted">{next.chair.name} presiding</p>
            )}
          </div>
          {quorumSet || inSession ? (
            <Link
              to={`/meetings/${next.robbieCode}`}
              aria-label={`${action} ${title}`}
              className="btn-primary w-full sm:w-auto"
            >
              {action}
            </Link>
          ) : (
            <QuorumNotSet canSet={canSetQuorum} />
          )}
        </div>
        {later.length > 0 && (
          <ul className="mt-4 space-y-1 border-t border-rule pt-3 text-sm">
            {later.map((meeting) => (
              <li key={meeting.id}>
                <Link
                  to={`/meetings/${meeting.robbieCode}`}
                  className="inline-flex min-h-11 items-center gap-1 text-gavel hover:underline md:min-h-0"
                >
                  {meeting.title || 'Untitled meeting'}
                  {meeting.scheduledFor && (
                    <span className="text-ink-muted">
                      , {formatMeetingTime(meeting.scheduledFor, timeZone)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <Card
      title="Next meeting"
      footer={
        <Link
          to="/meetings"
          className="inline-flex min-h-11 items-center text-sm text-gavel hover:underline md:min-h-0"
        >
          All meetings
        </Link>
      }
    >
      {body}
    </Card>
  );
}

function DocumentsList({
  part,
  timeZone,
  onRetry,
}: {
  part: Part<Document[]>;
  timeZone?: string;
  onRetry: () => void;
}) {
  // Documents are created by secretaries and above
  const canCreate = useCan('secretary');
  if (!part) return <p className="px-5 py-4 text-sm text-ink-muted">Loading the documents...</p>;
  if ('failed' in part) {
    return <ErrorState inline title="Couldn't load the documents." onRetry={onRetry} />;
  }
  if (part.data.length === 0) {
    return (
      <p className="px-5 py-6 text-center text-ink-muted">
        {canCreate
          ? 'No documents yet. Create your first document to get started.'
          : 'No documents yet.'}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-rule">
      {part.data.map((doc) => (
        <li key={doc.id}>
          <Link
            to={`/documents/${doc.id}`}
            className="group flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface-2"
          >
            <span className="flex min-w-0 flex-1 items-center gap-4">
              <FileText className="h-5 w-5 shrink-0 text-gavel" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{doc.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <DocumentTypeBadge type={doc.docType} />
                  Added {formatDate(doc.createdAt, timeZone)}
                </span>
              </span>
            </span>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-ink-muted transition-colors group-hover:text-gavel"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PendingList({ part, onRetry }: { part: Part<Amendment[]>; onRetry: () => void }) {
  if (!part) return <p className="px-5 py-4 text-sm text-ink-muted">Loading the amendments...</p>;
  if ('failed' in part) {
    return <ErrorState inline title="Couldn't load the amendments." onRetry={onRetry} />;
  }
  if (part.data.length === 0) {
    return <p className="px-5 py-4 text-sm text-ink-muted">No pending amendments.</p>;
  }
  return (
    <ul className="divide-y divide-rule">
      {part.data.slice(0, 5).map((amendment) => (
        <li key={amendment.id}>
          <Link
            to={`/amendments/${amendment.id}`}
            className="block px-5 py-3 transition-colors hover:bg-surface-2"
          >
            <span className="mb-1 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-ink">
                {amendment.title}
              </span>
              <span className="shrink-0">
                <StatusBadge status={amendment.status} />
              </span>
            </span>
            {amendment.description && (
              <span className="line-clamp-1 text-xs text-ink-muted">{amendment.description}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
