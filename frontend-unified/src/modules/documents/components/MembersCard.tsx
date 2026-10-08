import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { UserPlus, Users, X } from 'lucide-react';
import {
  members as membersApi,
  type AddMemberResult,
  type OrgMember,
  type PendingInvite,
} from '../../../api/client';
import { useCan, useOrganization } from '../../../context/OrganizationContext';
import { useSession } from '../../../context/SessionContext';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { ROLE_LABELS, assignableRoles, type OrgRole } from '../../../utils/roles';

type Notice = { kind: 'status' | 'alert'; text: string };

const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

/** What happened after adding someone by email, in words */
function addedMessage(email: string, result: AddMemberResult): string {
  const role = ROLE_LABELS[result.status === 'added' ? result.member.role : result.invite.role];
  if (result.status === 'updated') {
    return `${email} was already waiting to join. Their role is now ${role}.`;
  }
  const unsent = result.emailSent ? '' : " We couldn't email them, so let them know yourself.";
  if (result.status === 'added') return `${email} was added as ${role}.${unsent}`;
  return `${email} will join as ${role} the first time they sign in.${unsent}`;
}

/** The organization's members; for admins, adding, changing and removing them */
export function MembersCard() {
  const { currentOrganization, role, refreshOrganizations } = useOrganization();
  const { user } = useSession();
  const isAdmin = useCan('admin');
  const orgId = currentOrganization?.id;
  const assignable = role ? assignableRoles(role) : [];

  const [list, setList] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<OrgRole>('member');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<OrgMember | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    const result = await membersApi.list(orgId);
    setList(result.members);
    setInvites(result.invites ?? []);
  }, [orgId]);

  useEffect(() => {
    load()
      .catch((err) =>
        setNotice({ kind: 'alert', text: messageOf(err, 'Failed to load the members') }),
      )
      .finally(() => setLoading(false));
  }, [load]);

  /** Run a change, reload the list, then show the outcome or the server's message */
  const act = async (change: () => Promise<string>, fallback: string) => {
    setBusy(true);
    setNotice(null);
    let outcome: Notice;
    try {
      outcome = { kind: 'status', text: await change() };
    } catch (err) {
      outcome = { kind: 'alert', text: messageOf(err, fallback) };
    }
    try {
      await load();
    } catch {
      // The change stands; say the list may be behind rather than replace its outcome
      outcome = { ...outcome, text: `${outcome.text} The list couldn't be refreshed.` };
    }
    setNotice(outcome);
    setBusy(false);
  };

  // Admins change roles up to admin, their own included; only an owner changes an owner. The
  // server keeps the last owner from stepping down. Leaving is in the danger zone.
  const canChangeRole = (target: OrgRole) => isAdmin && (role === 'owner' || target !== 'owner');
  const canRemove = (member: OrgMember) => canChangeRole(member.role) && member.userId !== user?.id;

  // Admins see every email; others see names, and a member without one yet as such
  const nameOf = (member: OrgMember) => member.name ?? member.email ?? 'A member without a name';

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    const address = email.trim().toLowerCase();
    void act(async () => {
      const result = await membersApi.add(orgId, address, newRole);
      setEmail('');
      return addedMessage(address, result);
    }, 'Failed to add them');
  };

  const onChangeRole = (member: OrgMember, next: OrgRole) => {
    if (!orgId) return;
    void act(async () => {
      await membersApi.changeRole(orgId, member.userId, next);
      // Your own new role shows in the header and decides what this page offers
      if (member.userId === user?.id) await refreshOrganizations();
      return `${nameOf(member)} is now ${ROLE_LABELS[next]}.`;
    }, 'Failed to change the role');
  };

  const onRemove = () => {
    const member = removing;
    setRemoving(null);
    if (!orgId || !member) return;
    void act(async () => {
      await membersApi.remove(orgId, member.userId);
      return `${nameOf(member)} was removed.`;
    }, 'Failed to remove them');
  };

  const onCancelInvite = (invite: PendingInvite) => {
    if (!orgId) return;
    void act(async () => {
      await membersApi.cancelInvite(orgId, invite.id);
      return `${invite.email} won't be added.`;
    }, 'Failed to cancel the addition');
  };

  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-rule">
        <h3 className="font-semibold text-ink flex items-center gap-2">
          <Users className="w-5 h-5" />
          Members
        </h3>
      </div>
      <div className="p-6 space-y-6">
        {notice && (
          <p
            role={notice.kind}
            className={`text-sm ${notice.kind === 'alert' ? 'text-gavel' : 'text-carried'}`}
          >
            {notice.text}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-ink-muted">Loading members...</p>
        ) : (
          <ul className="divide-y divide-rule">
            {list.map((member) => (
              <li
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">
                    {nameOf(member)}
                    {member.userId === user?.id && (
                      <span className="font-normal text-ink-muted"> (you)</span>
                    )}
                  </p>
                  {member.email && (
                    <p className="text-sm text-ink-muted truncate">{member.email}</p>
                  )}
                </div>
                {canChangeRole(member.role) ? (
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Role of ${nameOf(member)}`}
                      className="select w-auto text-sm py-1"
                      value={member.role}
                      disabled={busy}
                      onChange={(e) => onChangeRole(member, e.target.value as OrgRole)}
                    >
                      {assignable.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    {canRemove(member) && (
                      <button
                        type="button"
                        aria-label={`Remove ${nameOf(member)}`}
                        className="btn-ghost btn-sm text-gavel"
                        disabled={busy}
                        onClick={() => setRemoving(member)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="badge bg-surface-2 text-ink">{ROLE_LABELS[member.role]}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {isAdmin && invites.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-ink mb-2">Waiting to sign in</h4>
            <ul className="divide-y divide-rule">
              {invites.map((invite) => (
                <li key={invite.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-sm text-ink truncate">
                    {invite.email}{' '}
                    <span className="text-ink-muted">({ROLE_LABELS[invite.role]})</span>
                  </span>
                  {canChangeRole(invite.role) && (
                    <button
                      type="button"
                      aria-label={`Cancel adding ${invite.email}`}
                      className="btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => onCancelInvite(invite)}
                    >
                      <X className="w-4 h-4 mr-1" aria-hidden="true" />
                      Cancel
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isAdmin && (
          <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[12rem]">
              <label htmlFor="memberEmail" className="label">
                Add by email
              </label>
              <input
                id="memberEmail"
                type="email"
                className="input"
                maxLength={254}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="memberRole" className="label">
                Role
              </label>
              <select
                id="memberRole"
                className="select"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as OrgRole)}
              >
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary" disabled={busy || !email.trim()}>
              <UserPlus className="w-4 h-4 mr-2" aria-hidden="true" />
              Add
            </button>
          </form>
        )}
      </div>

      <ConfirmDialog
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={onRemove}
        title="Remove member"
        message={`Remove ${removing ? nameOf(removing) : ''} from ${currentOrganization?.name}? They lose access to its documents and meetings.`}
        confirmText="Remove"
        variant="danger"
      />
    </div>
  );
}
