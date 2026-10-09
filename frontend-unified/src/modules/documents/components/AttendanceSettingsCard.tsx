import { useEffect, useState, type FormEvent } from 'react';
import { Users } from 'lucide-react';
import { members as membersApi, organizations as organizationsApi } from '../../../api/client';
import { useCan, useOrganization } from '../../../context/OrganizationContext';
import { useToast } from '../../../context/ToastContext';
import { QuorumFields } from '../../../components/organizations/QuorumFields';
import { quorumDraftOf, readQuorumDraft } from '../../../components/organizations/quorumDraft';
import { quorumInWords, quorumIsSet } from '../../../utils/quorum';

/**
 * The organization's voting members and quorum, which every meeting starts from (a meeting can
 * still change its own quorum). Admins edit them; until they are set, no meeting can open.
 */
export function AttendanceSettingsCard() {
  const { currentOrganization, refreshOrganizations } = useOrganization();
  const isAdmin = useCan('admin');
  const [editing, setEditing] = useState(false);
  if (!currentOrganization) return null;

  const org = currentOrganization;
  const set = quorumIsSet(org);

  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-rule px-4 py-4 sm:px-6">
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
            {set ? 'Edit' : 'Set them'}
          </button>
        )}
      </div>
      <div className="space-y-4 p-4 sm:p-6">
        {!set && !editing && (
          <p className="rounded-lg bg-caution-tint px-3 py-2 text-sm text-caution-ink">
            {isAdmin
              ? 'Set the voting members and the quorum from your bylaws: no meeting can open until they are set.'
              : 'An admin sets the voting members and the quorum here: no meeting can open until they are set.'}
          </p>
        )}
        {editing ? (
          <AttendanceForm
            organizationId={org.id}
            initial={quorumDraftOf(set ? org : null)}
            initialBoardQuorum={org.boardQuorum ?? null}
            onDone={async (saved) => {
              if (saved) await refreshOrganizations();
              setEditing(false);
            }}
          />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-ink-muted">Voting members</dt>
              <dd className="font-medium text-ink">{set ? org.eligibleVoters : 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">Quorum</dt>
              <dd className="font-medium text-ink">{set ? quorumInWords(org) : 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">Board quorum</dt>
              <dd className="font-medium text-ink">{boardQuorumInWords(org.boardQuorum)}</dd>
            </div>
          </dl>
        )}
        <p className="text-xs text-ink-muted">
          Every meeting starts with this quorum. Voting members are the lots or units that vote,
          whether or not their owners have an account. A board meeting counts its board members
          instead.
        </p>
      </div>
    </div>
  );
}

/** The board's quorum in words: a number of board members, or a majority of them */
function boardQuorumInWords(boardQuorum: number | null | undefined): string {
  if (!boardQuorum) return 'A majority of the board';
  return `${boardQuorum} board ${boardQuorum === 1 ? 'member' : 'members'}`;
}

function AttendanceForm({
  organizationId,
  initial,
  initialBoardQuorum,
  onDone,
}: {
  organizationId: string;
  initial: ReturnType<typeof quorumDraftOf>;
  initialBoardQuorum: number | null;
  onDone: (saved: boolean) => Promise<void>;
}) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState(initial);
  const [boardQuorum, setBoardQuorum] = useState(
    initialBoardQuorum === null ? '' : String(initialBoardQuorum),
  );
  // The board members, whom the board's quorum can't outnumber (null until loaded)
  const [directors, setDirectors] = useState<number | null>(null);
  useEffect(() => {
    let canceled = false;
    membersApi
      .list(organizationId)
      .then(({ members }) => {
        if (!canceled) setDirectors(members.filter((m) => m.isDirector).length);
      })
      .catch(() => {
        // The server checks it anyway
      });
    return () => {
      canceled = true;
    };
  }, [organizationId]);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const settings = readQuorumDraft(draft);
    if ('problem' in settings) {
      setProblem(settings.problem);
      return;
    }
    // Empty is a majority of the board
    const board = boardQuorum.trim() === '' ? null : Number(boardQuorum);
    if (board !== null && (!Number.isInteger(board) || board < 1 || board > 25)) {
      setProblem('The board quorum is a whole number of board members, from 1 to 25');
      return;
    }
    if (board !== null && directors !== null && board > directors) {
      setProblem(
        `The board quorum can't be more than the ${directors} board ${directors === 1 ? 'member' : 'members'}`,
      );
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      // Setting the quorum one way clears the other on the server
      await organizationsApi.update(organizationId, {
        ...settings.body,
        ...(board !== initialBoardQuorum && { boardQuorum: board }),
      });
      showToast('success', 'Attendance settings saved');
      await onDone(true);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't save the settings");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-4">
      <QuorumFields value={draft} onChange={setDraft} />
      <div>
        <label htmlFor="boardQuorum" className="label">
          Board quorum (optional)
        </label>
        <input
          id="boardQuorum"
          type="number"
          inputMode="numeric"
          className="input w-32"
          value={boardQuorum}
          onChange={(e) => setBoardQuorum(e.target.value)}
          aria-describedby="boardQuorumHint"
        />
        <p id="boardQuorumHint" className="mt-1 text-xs text-ink-muted">
          How many board members make a quorum at a board meeting, if your bylaws say. Leave it
          empty for a majority of the board
          {directors === null
            ? '.'
            : ` (${directors} ${directors === 1 ? 'member' : 'members'}, marked on the Members page).`}
        </p>
      </div>
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
