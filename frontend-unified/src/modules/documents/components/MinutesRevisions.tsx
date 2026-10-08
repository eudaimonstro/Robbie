import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { minutes as minutesApi, type MinutesRevision } from '../../../api/client';
import { formatMeetingTimeWithYear } from '../../../utils/dates';

/**
 * For the secretary: what published minutes said before each change since they were published,
 * the latest change first, with who made it and when. Read again when the minutes change.
 * Nothing shows until there is a change.
 */
export default function MinutesRevisions({
  minutesId,
  updatedAt,
  timeZone,
}: {
  minutesId: string;
  /** When the minutes last changed: a new save may have made a revision */
  updatedAt: string;
  /** The organization's, as the minutes give their times */
  timeZone: string;
}) {
  const [revisions, setRevisions] = useState<MinutesRevision[]>([]);

  useEffect(() => {
    let current = true;
    minutesApi
      .revisions(minutesId)
      .then((list) => {
        if (current) setRevisions(list);
      })
      // Best effort: the minutes are there without their history
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [minutesId, updatedAt]);

  if (revisions.length === 0) return null;
  return (
    <section aria-labelledby="minutes-revisions-heading" className="card p-4 sm:p-6">
      <h3 id="minutes-revisions-heading" className="card-title flex items-center gap-2">
        <History className="h-4 w-4 text-ink-muted" aria-hidden="true" />
        Changes since publishing
      </h3>
      <p className="mt-1 text-sm text-ink-muted">
        Members read the published text, so each change keeps what it replaced.
      </p>
      <ul className="mt-3 divide-y divide-rule">
        {revisions.map((revision) => (
          <li key={revision.id} className="py-2">
            <details>
              <summary className="cursor-pointer text-sm text-ink">
                Changed by {revision.editedBy?.name ?? 'a former member'} on{' '}
                {formatMeetingTimeWithYear(revision.editedAt, timeZone)}
              </summary>
              <p className="label-caps mt-2">The text before this change</p>
              <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-sm text-ink">
                {revision.body}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
