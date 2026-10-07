import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { minutes as minutesApi, type MinutesSummary } from '../../../api/client';
import { useCan, useOrganization } from '../../../context/OrganizationContext';
import { MinutesStatusBadge } from '../../../components/ui/Badge';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { formatMeetingTimeWithYear } from '../../../utils/dates';
import { meetingName } from '../utils/minutes';

/** The current organization's minutes, the latest meeting first (/minutes) */
export default function MinutesListPage() {
  const { currentOrganization } = useOrganization();
  const isSecretary = useCan('secretary');
  const organizationId = currentOrganization?.id ?? null;
  // Kept with the organization they are of, so a switch never shows the last one's
  const [loaded, setLoaded] = useState<{ organizationId: string; list: MinutesSummary[] } | null>(
    null,
  );
  // The organization whose list failed to load, so a switch tries the next one
  const [failedFor, setFailedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    let canceled = false;
    minutesApi
      .list(organizationId)
      .then((list) => {
        if (canceled) return;
        setLoaded({ organizationId, list });
        // Back to an organization whose list failed before, and loaded this time
        setFailedFor((failed) => (failed === organizationId ? null : failed));
      })
      .catch(() => {
        if (!canceled) setFailedFor(organizationId);
      });
    return () => {
      canceled = true;
    };
  }, [organizationId]);

  if (!organizationId) {
    return (
      <p className="py-12 text-center text-ink-muted">Choose an organization to see its minutes.</p>
    );
  }
  if (failedFor === organizationId)
    return <p className="py-12 text-center text-ink-muted">Couldn&apos;t load the minutes.</p>;
  const list = loaded?.organizationId === organizationId ? loaded.list : null;
  if (!list) return <LoadingPage />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="page-title">Minutes</h2>
        <p className="mt-1 text-ink-muted">
          {isSecretary
            ? 'Robbie drafts the minutes when a meeting adjourns. Check them, then publish them for the members and the next meeting.'
            : 'The minutes of your meetings, once the secretary publishes them.'}
        </p>
      </div>
      {list.length === 0 ? (
        <p className="card p-6 text-ink-muted">
          No minutes yet. Robbie drafts them when a meeting adjourns.
        </p>
      ) : (
        <ul className="card divide-y divide-rule">
          {list.map((item) => (
            <li key={item.id}>
              <Link
                to={`/minutes/${item.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{meetingName(item)}</span>
                  <span className="block text-sm text-ink-muted">
                    {item.packet.scheduledFor
                      ? formatMeetingTimeWithYear(
                          item.packet.scheduledFor,
                          currentOrganization?.timeZone,
                        )
                      : 'No date'}
                  </span>
                </span>
                <MinutesStatusBadge status={item.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
