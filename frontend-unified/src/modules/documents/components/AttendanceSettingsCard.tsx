import { useId, useState, type FormEvent } from 'react';
import { Users } from 'lucide-react';
import { organizations as organizationsApi, type OrganizationUpdate } from '../../../api/client';
import { useCan, useOrganization } from '../../../context/OrganizationContext';
import { useToast } from '../../../context/ToastContext';

type QuorumKind = 'percent' | 'count';

/**
 * The organization's voting members and quorum, which every meeting starts from (a meeting can
 * still change its own quorum). Admins edit them.
 */
export function AttendanceSettingsCard() {
  const { currentOrganization, refreshOrganizations } = useOrganization();
  const isAdmin = useCan('admin');
  const [editing, setEditing] = useState(false);
  if (!currentOrganization) return null;

  const org = currentOrganization;
  const quorumText = org.quorumPercent
    ? `${org.quorumPercent}% of the voting members`
    : `${org.quorumCount ?? 3} people`;

  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-rule px-6 py-4">
        <h3 className="card-title flex items-center gap-2">
          <Users className="h-5 w-5" aria-hidden="true" />
          Attendance
        </h3>
        {isAdmin && !editing && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            aria-label="Edit attendance"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        )}
      </div>
      <div className="space-y-4 p-6">
        {editing ? (
          <AttendanceForm
            organizationId={org.id}
            eligibleVoters={org.eligibleVoters ?? null}
            quorumPercent={org.quorumPercent ?? null}
            quorumCount={org.quorumCount ?? null}
            onDone={async (saved) => {
              if (saved) await refreshOrganizations();
              setEditing(false);
            }}
          />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-ink-muted">Voting members</dt>
              <dd className="font-medium text-ink">
                {org.eligibleVoters ?? 'Counted from the members list'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">Quorum</dt>
              <dd className="font-medium text-ink">{quorumText}</dd>
            </div>
          </dl>
        )}
        <p className="text-xs text-ink-muted">
          Every meeting starts with this quorum. Voting members are the lots or units that vote,
          whether or not their owners have an account.
        </p>
      </div>
    </div>
  );
}

function AttendanceForm({
  organizationId,
  eligibleVoters,
  quorumPercent,
  quorumCount,
  onDone,
}: {
  organizationId: string;
  eligibleVoters: number | null;
  quorumPercent: number | null;
  quorumCount: number | null;
  onDone: (saved: boolean) => Promise<void>;
}) {
  const votersId = useId();
  const quorumId = useId();
  const { showToast } = useToast();
  const [voters, setVoters] = useState(eligibleVoters ? String(eligibleVoters) : '');
  const [kind, setKind] = useState<QuorumKind>(quorumPercent ? 'percent' : 'count');
  const [quorum, setQuorum] = useState(String(quorumPercent ?? quorumCount ?? 3));
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const eligible = voters.trim() === '' ? null : Number(voters);
    if (eligible !== null && (!Number.isInteger(eligible) || eligible < 1)) {
      setProblem('Voting members is a whole number, 1 or more, or empty to count the members list');
      return;
    }
    const value = Number(quorum);
    if (kind === 'percent' && (!Number.isInteger(value) || value < 1 || value > 100)) {
      setProblem('The quorum is a percentage from 1 to 100');
      return;
    }
    if (kind === 'count' && (!Number.isInteger(value) || value < 1)) {
      setProblem('The quorum is a whole number of people, 1 or more');
      return;
    }
    // Setting the quorum one way clears the other on the server
    const body: OrganizationUpdate = {
      eligibleVoters: eligible,
      ...(kind === 'percent' ? { quorumPercent: value } : { quorumCount: value }),
    };
    setProblem(null);
    setSaving(true);
    try {
      await organizationsApi.update(organizationId, body);
      showToast('success', 'Attendance settings saved');
      await onDone(true);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't save the settings");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-4">
      <div>
        <label htmlFor={votersId} className="label">
          Voting members
        </label>
        <input
          id={votersId}
          className="input tabular-nums"
          inputMode="numeric"
          value={voters}
          onChange={(e) => setVoters(e.target.value)}
        />
        <p className="mt-1 text-xs text-ink-muted">
          How many lots or units vote (142, say). Leave it empty to count the members list.
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="label">Quorum</legend>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="radio"
            name="quorum-kind"
            checked={kind === 'percent'}
            onChange={() => setKind('percent')}
          />
          A percentage of the voting members
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="radio"
            name="quorum-kind"
            checked={kind === 'count'}
            onChange={() => setKind('count')}
          />
          A number of people
        </label>
        <div className="flex items-center gap-2">
          <label htmlFor={quorumId} className="sr-only">
            {kind === 'percent' ? 'Quorum percentage' : 'Quorum count'}
          </label>
          <input
            id={quorumId}
            className="input w-32 tabular-nums"
            inputMode="numeric"
            value={quorum}
            onChange={(e) => setQuorum(e.target.value)}
          />
          <span className="text-sm text-ink-muted">{kind === 'percent' ? '%' : 'people'}</span>
        </div>
      </fieldset>
      {problem && (
        <p role="alert" className="text-sm text-gavel">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary btn-sm" disabled={saving}>
          Save
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => void onDone(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
