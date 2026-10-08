import { useId, useMemo, useState } from 'react';
import { members as membersApi, type OrgMember, type PendingInvite } from '../../../api/client';
import { ROLE_LABELS, type OrgRole } from '../../../utils/roles';
import { count } from '../../../utils/plural';
import { MAX_BULK_PEOPLE, readPastedPeople, type PastedLine } from '../utils/bulkMembers';

/** What adding a line would do: add the person, nothing (a member), or update a waiting one */
type LineOutcome = 'add' | 'member' | 'waiting';

interface BulkAddMembersProps {
  organizationId: string;
  /** The organization's members and pending additions, as the card has them (with emails) */
  members: OrgMember[];
  invites: PendingInvite[];
  /** The roles this admin can give */
  assignable: OrgRole[];
  /** After the addition: what to say, and the list to reload */
  onAdded: (message: string) => Promise<void>;
  onCancel: () => void;
}

const OUTCOME_WORDS: Record<LineOutcome, string> = {
  add: 'To add',
  member: 'Already a member',
  waiting: 'Waiting to sign in: role and name updated',
};

/**
 * Add many people at once: a pasted list (a name and an email on each line, or just the email),
 * a preview of each line with its problem, one role for all, and one request. Nobody is emailed:
 * each person joins the first time they sign in with their address.
 */
export function BulkAddMembers({
  organizationId,
  members,
  invites,
  assignable,
  onAdded,
  onCancel,
}: BulkAddMembersProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [role, setRole] = useState<OrgRole>('member');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const lines = useMemo(() => readPastedPeople(text), [text]);
  const memberEmails = useMemo(
    () => new Set(members.map((m) => m.email?.toLowerCase()).filter(Boolean)),
    [members],
  );
  const waitingEmails = useMemo(() => new Set(invites.map((i) => i.email)), [invites]);
  const outcomeOf = (line: Extract<PastedLine, { email: string }>): LineOutcome =>
    memberEmails.has(line.email) ? 'member' : waitingEmails.has(line.email) ? 'waiting' : 'add';

  const people = lines.filter(
    (line): line is Extract<PastedLine, { email: string }> => 'email' in line,
  );
  const sending = people.filter((line) => outcomeOf(line) !== 'member');
  const toAdd = sending.filter((line) => outcomeOf(line) === 'add').length;
  const toFix = lines.length - people.length;
  const already = people.length - sending.length;
  const tooMany = sending.length > MAX_BULK_PEOPLE;

  const summary = [
    `${count(toAdd, 'person', 'people')} to add`,
    ...(sending.length > toAdd ? [`${sending.length - toAdd} waiting to sign in`] : []),
    ...(already > 0 ? [`${already} already ${already === 1 ? 'a member' : 'members'}`] : []),
    ...(toFix > 0 ? [`${count(toFix, 'line')} to fix`] : []),
  ].join(', ');

  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const { results } = await membersApi.addBulk(
        organizationId,
        sending.map((line) => ({ email: line.email, ...(line.name && { name: line.name }) })),
        role,
      );
      const added = results.filter((r) => r.status === 'added' || r.status === 'invited').length;
      const updated = results.filter((r) => r.status === 'updated').length;
      const parts = [
        `Added ${count(added, 'person', 'people')} as ${ROLE_LABELS[role]}.`,
        ...(updated > 0 ? [`Updated ${count(updated, 'waiting addition')}.`] : []),
        ...(toFix > 0 ? [`${count(toFix, 'line')} left out to fix.`] : []),
      ];
      setText('');
      await onAdded(parts.join(' '));
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't add them");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4 rounded-lg bg-surface-2 p-4">
      <h4 id={`${id}-heading`} className="text-sm font-medium text-ink">
        Add several people
      </h4>
      <div>
        <label htmlFor={`${id}-list`} className="label">
          People, one per line
        </label>
        <p id={`${id}-hint`} className="mb-1 text-xs text-ink-muted">
          A name and an email on each line (&quot;Carmen Diaz, carmen@example.com&quot;), or just
          the email. A column pasted from a spreadsheet works too.
        </p>
        <textarea
          id={`${id}-list`}
          className="textarea font-mono text-sm"
          rows={6}
          value={text}
          aria-describedby={`${id}-hint`}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={`${id}-role`} className="label">
          Role for everyone on the list
        </label>
        <select
          id={`${id}-role`}
          className="select w-auto"
          value={role}
          onChange={(e) => setRole(e.target.value as OrgRole)}
        >
          {assignable.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      {lines.length > 0 && (
        <div className="space-y-2">
          <p role="status" className="text-sm font-medium text-ink">
            {summary}
          </p>
          <ol
            aria-label="The list, line by line"
            className="max-h-72 divide-y divide-rule overflow-y-auto rounded-lg border border-rule bg-surface scrollbar-thin"
          >
            {lines.map((line) => (
              <li key={line.line} className="flex items-start gap-3 px-3 py-2 text-sm">
                <span className="w-6 shrink-0 tabular-nums text-ink-muted">{line.line}</span>
                {/* Name over email (or the line over its problem), so a phone keeps both */}
                {'email' in line ? (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">
                        {line.name || <span className="text-ink-muted">No name</span>}
                      </span>
                      <span className="block truncate text-ink-muted">{line.email}</span>
                    </span>
                    <span
                      className={`max-w-[45%] shrink-0 text-right text-xs ${
                        outcomeOf(line) === 'add' ? 'text-carried' : 'text-ink-muted'
                      }`}
                    >
                      {OUTCOME_WORDS[outcomeOf(line)]}
                    </span>
                  </>
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink-muted">{line.text}</span>
                    <span className="block text-xs font-medium text-gavel">{line.problem}</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
          {tooMany && (
            <p role="alert" className="text-sm text-gavel">
              At most {MAX_BULK_PEOPLE} people at a time: split the list.
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-ink-muted">
        No emails are sent. Each person joins the first time they sign in with their address, for
        example from a meeting&apos;s link or QR code, and the chair can count them in the room
        before then. People who already have a Robbie account are added at once.
      </p>
      {problem && (
        <p role="alert" className="text-sm text-gavel">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || sending.length === 0 || tooMany}
          onClick={() => void submit()}
        >
          {sending.length === 0 ? 'Add them' : `Add ${count(sending.length, 'person', 'people')}`}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
