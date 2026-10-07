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
  const { currentOrganization, role } = useOrganization();
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
    try {
      const result = await membersApi.list(orgId);
      setList(result.members);
      setInvites(result.invites ?? []);
    } catch (err) {
      setNotice({ kind: 'alert', text: messageOf(err, 'Failed to load the members') });
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Run a change, show its outcome or the server's message, and reload the list */
  const act = async (change: () => Promise<string>, fallback: string) => {
    setBusy(true);
    setNotice(null);
    try {
      setNotice({ kind: 'status', text: await change() });
    } catch (err) {
      setNotice({ kind: 'alert', text: messageOf(err, fallback) });
    } finally {
      setBusy(false);
    }
    await load();
  };

  // Admins change members up to admin; only an owner changes an owner. Your own membership
  // changes by leaving, in the danger zone.
  const canManage = (target: OrgRole, userId?: number) =>
    isAdmin && userId !== user?.id && (role === 'owner' || target !== 'owner');

  const nameOf = (member: OrgMember) => member.name ?? member.email;

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
      <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
        <h3 className="font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
          <Users className="w-5 h-5" />
          Members
        </h3>
      </div>
      <div className="p-6 space-y-6">
        {notice && (
          <p
            role={notice.kind}
            className={`text-sm ${
              notice.kind === 'alert'
                ? 'text-danger-600 dark:text-danger-400'
                : 'text-success-700 dark:text-success-400'
            }`}
          >
            {notice.text}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-secondary-500">Loading members...</p>
        ) : (
          <ul className="divide-y divide-secondary-100 dark:divide-secondary-700">
            {list.map((member) => (
              <li
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-secondary-900 dark:text-white truncate">
                    {nameOf(member)}
                    {member.userId === user?.id && (
                      <span className="font-normal text-secondary-500"> (you)</span>
                    )}
                  </p>
                  <p className="text-sm text-secondary-500 truncate">{member.email}</p>
                </div>
                {canManage(member.role, member.userId) ? (
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
                    <button
                      type="button"
                      aria-label={`Remove ${nameOf(member)}`}
                      className="btn-ghost btn-sm text-danger-600"
                      disabled={busy}
                      onClick={() => setRemoving(member)}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <span className="badge bg-secondary-100 text-secondary-700 dark:bg-secondary-700 dark:text-secondary-200">
                    {ROLE_LABELS[member.role]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {isAdmin && invites.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Waiting to sign in
            </h4>
            <ul className="divide-y divide-secondary-100 dark:divide-secondary-700">
              {invites.map((invite) => (
                <li key={invite.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-sm text-secondary-700 dark:text-secondary-300 truncate">
                    {invite.email}{' '}
                    <span className="text-secondary-500">({ROLE_LABELS[invite.role]})</span>
                  </span>
                  {canManage(invite.role) && (
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
