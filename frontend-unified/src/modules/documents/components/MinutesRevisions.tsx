import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { minutes as minutesApi, type MinutesRevision } from '../../../api/client';
import { formatMeetingTimeWithYear } from '../../../utils/dates';

/**
 * For the secretary: the changes to published minutes since they were published, the latest
 * first, with who made each and when. A change's text (the minutes before it) is read when it
 * is opened. Read again when the minutes change; nothing shows until there is a change.
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
            <RevisionText minutesId={minutesId} revision={revision} timeZone={timeZone} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One change, its text read the first time it is opened */
function RevisionText({
  minutesId,
  revision,
  timeZone,
}: {
  minutesId: string;
  revision: MinutesRevision;
  timeZone: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const onToggle = (open: boolean) => {
    if (!open || text !== null) return;
    setFailed(false);
    minutesApi
      .revision(minutesId, revision.id)
      .then((full) => setText(full.body))
      .catch(() => setFailed(true));
  };

  return (
    <details onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm text-ink">
        Changed by {revision.editedBy?.name ?? 'a former member'} on{' '}
        {formatMeetingTimeWithYear(revision.editedAt, timeZone)}
      </summary>
      <p className="label-caps mt-2">The text before this change</p>
      {failed ? (
        <p className="mt-1 text-sm text-caution-ink">Couldn&apos;t load this text.</p>
      ) : text === null ? (
        <p className="mt-1 text-sm text-ink-muted">Loading...</p>
      ) : (
        <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-sm text-ink">
          {text}
        </pre>
      )}
    </details>
  );
}
