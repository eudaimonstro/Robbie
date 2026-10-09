import { useEffect, useState, type ReactNode } from 'react';
import {
  Settings,
  Building2,
  UserCircle,
  Trash2,
  Sun,
  Moon,
  Monitor,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useCan, useOrganization } from '../../../context/OrganizationContext';
import { useSession } from '../../../context/SessionContext';
import { useTheme } from '../../../context/ThemeContext';
import { members as membersApi, organizations as organizationsApi } from '../../../api/client';
import Modal from '../../../components/ui/Modal';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../context/ToastContext';
import { NoOrganizations } from '../../../components/organizations/NoOrganizations';
import { MembersCard } from '../components/MembersCard';
import { AttendanceSettingsCard } from '../components/AttendanceSettingsCard';
import { TimeZoneCard } from '../components/TimeZoneCard';
import { BylawVoteCard } from '../components/BylawVoteCard';
import { DeleteOrganizationDialog } from '../components/DeleteOrganizationDialog';
import { formatDate } from '../../../utils/dates';
import { scrollBehavior } from '../../../utils/motion';

const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export default function SettingsPage() {
  const { currentOrganization, refreshOrganizations } = useOrganization();
  // A link to one card (/settings#attendance, /settings#members) brings it into view once the
  // organization's cards are there
  const organizationId = currentOrganization?.id;
  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (!target || !organizationId) return;
    document
      .getElementById(target)
      ?.scrollIntoView?.({ behavior: scrollBehavior(), block: 'start' });
  }, [organizationId]);
  // The organization's name and description are the admins'; deleting it is the owners'
  const isAdmin = useCan('admin');
  const isOwner = useCan('owner');
  const { showToast } = useToast();
  const { user, setName } = useSession();

  // Display name
  const [displayName, setDisplayName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingName(true);
      await setName(displayName.trim());
      showToast('success', 'Name updated');
    } catch (err) {
      showToast('error', messageOf(err, "Couldn't change your name"));
    } finally {
      setSavingName(false);
    }
  };

  // Edit organization
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Leave, and delete
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleEditOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !editName.trim()) return;

    try {
      setSaving(true);
      await organizationsApi.update(currentOrganization.id, {
        name: editName.trim(),
        description: editDescription.trim(),
      });
      await refreshOrganizations();
      setEditModalOpen(false);
      showToast('success', 'Organization updated');
    } catch (err) {
      showToast('error', messageOf(err, "Couldn't save the organization"));
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    if (!currentOrganization || !user) return;
    const name = currentOrganization.name;
    try {
      setLeaving(true);
      await membersApi.remove(currentOrganization.id, user.id);
      setLeaveDialogOpen(false);
      // The refresh moves the selection to another organization, or to none
      await refreshOrganizations();
      showToast('success', `You left ${name}`);
    } catch (err) {
      // The last owner can't leave: "An organization needs at least one owner"
      setLeaveDialogOpen(false);
      showToast('error', messageOf(err, "Couldn't leave the organization"));
    } finally {
      setLeaving(false);
    }
  };

  const handleDeleteOrganization = async () => {
    if (!currentOrganization) return;

    try {
      setDeleting(true);
      await organizationsApi.delete(currentOrganization.id);
      setDeleteDialogOpen(false);
      await refreshOrganizations();
      showToast('success', 'Organization deleted');
    } catch (err) {
      showToast('error', messageOf(err, "Couldn't delete the organization"));
    } finally {
      setDeleting(false);
    }
  };

  const openEditModal = () => {
    if (currentOrganization) {
      setEditName(currentOrganization.name);
      setEditDescription(currentOrganization.description ?? '');
      setEditModalOpen(true);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h2 className="page-title">Settings</h2>
        <p className="text-ink-muted mt-1">Your name, your organization and its members</p>
      </div>

      <div className="space-y-6">
        {/* Your name */}
        <SettingsCard title="Your name" Icon={UserCircle}>
          <form onSubmit={handleSaveName} className="p-4 sm:p-6">
            <label htmlFor="displayName" className="label">
              Your name
            </label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input"
              minLength={2}
              maxLength={100}
              required
            />
            <p className="text-sm text-ink-muted mt-1">Shown to others in meetings.</p>
            <div className="flex justify-end mt-4">
              <button
                type="submit"
                className="btn-primary"
                disabled={savingName || displayName.trim() === user?.name}
              >
                {savingName ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </SettingsCard>

        {/* Yours too, so it comes before the organization's settings */}
        <AppearanceCard />

        {currentOrganization ? (
          <>
            {/* Organization */}
            <SettingsCard
              title="Organization"
              Icon={Building2}
              action={
                isAdmin && (
                  <button onClick={openEditModal} className="btn-secondary btn-sm">
                    Edit
                  </button>
                )
              }
            >
              <dl className="p-4 sm:p-6 space-y-4">
                <div>
                  <dt className="text-sm text-ink-muted">Name</dt>
                  <dd className="font-medium text-ink">{currentOrganization.name}</dd>
                </div>
                {currentOrganization.description && (
                  <div>
                    <dt className="text-sm text-ink-muted">Description</dt>
                    <dd className="text-ink">{currentOrganization.description}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-ink-muted">Created</dt>
                  <dd className="text-ink">
                    {formatDate(currentOrganization.createdAt, currentOrganization.timeZone)}
                  </dd>
                </div>
              </dl>
            </SettingsCard>

            {/* Voting members and the quorum every meeting starts from; keyed like MembersCard.
                /settings#attendance comes here (the setup checklist, a meeting that can't open) */}
            <div id="attendance" className="scroll-mt-4">
              <AttendanceSettingsCard key={`attendance-${currentOrganization.id}`} />
            </div>

            {/* The time zone the minutes give times in, beside the attendance settings */}
            <TimeZoneCard key={`time-zone-${currentOrganization.id}`} />

            {/* What amending the bylaws needs, which meetings put on the question */}
            <BylawVoteCard key={`bylaw-vote-${currentOrganization.id}`} />

            {/* Keyed so a switch starts the card afresh, without the previous members.
                /settings#members comes here (the setup checklist) */}
            <div id="members" className="scroll-mt-4">
              <MembersCard key={currentOrganization.id} />
            </div>

            {/* Danger zone: last of the organization's settings */}
            <div className="card border-gavel/30">
              <div className="px-4 py-4 sm:px-6 border-b border-gavel/30 bg-gavel-tint rounded-t-xl">
                <h3 className="card-title">Danger zone</h3>
              </div>
              <div className="p-4 sm:p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">Leave the organization</p>
                    <p className="text-sm text-ink-muted">
                      You lose access to its documents and meetings. Its last owner can&apos;t
                      leave.
                    </p>
                  </div>
                  <button onClick={() => setLeaveDialogOpen(true)} className="btn-secondary btn-sm">
                    <LogOut className="w-4 h-4" aria-hidden="true" />
                    Leave
                  </button>
                </div>
                {isOwner && (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">Delete the organization</p>
                      <p className="text-sm text-ink-muted">
                        Deletes the organization and everything in it, for good.
                      </p>
                    </div>
                    <button onClick={() => setDeleteDialogOpen(true)} className="btn-danger btn-sm">
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <NoOrganizations />
        )}

        {/* About */}
        <SettingsCard title="About Robbie" Icon={Settings}>
          <div className="p-4 sm:p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Version</span>
              <span className="text-sm text-ink">1.0.0</span>
            </div>
            <div className="pt-3 border-t border-rule">
              <p className="text-sm text-ink-muted">
                Robbie runs meetings by Robert&apos;s Rules of Order and keeps your
                organization&apos;s bylaws, with every version and amendment.
              </p>
            </div>
          </div>
        </SettingsCard>
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit the organization"
      >
        <form onSubmit={handleEditOrganization}>
          <div className="mb-4">
            <label htmlFor="orgName" className="label">
              Name
            </label>
            <input
              type="text"
              id="orgName"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="input"
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="mb-6">
            <label htmlFor="orgDescription" className="label">
              Description
            </label>
            <textarea
              id="orgDescription"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="textarea h-24"
              maxLength={2000}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditModalOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!editName.trim() || saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Leave Confirmation */}
      <ConfirmDialog
        isOpen={leaveDialogOpen}
        onClose={() => setLeaveDialogOpen(false)}
        onConfirm={handleLeave}
        title="Leave the organization?"
        message={`Leave ${currentOrganization?.name}? You lose access to its documents and meetings until someone adds you again.`}
        confirmText="Leave organization"
        variant="danger"
        loading={leaving}
      />

      {/* Delete Confirmation */}
      {deleteDialogOpen && currentOrganization && (
        <DeleteOrganizationDialog
          organizationName={currentOrganization.name}
          deleting={deleting}
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={handleDeleteOrganization}
        />
      )}
    </div>
  );
}

/** A settings card: its title at the one card size, an icon, and an action beside it */
function SettingsCard({
  title,
  Icon,
  action,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 border-b border-rule">
        <h3 className="card-title flex items-center gap-2">
          <Icon className="w-5 h-5" aria-hidden="true" />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

const THEMES = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const;

/** Light, dark or the system's color scheme */
function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  return (
    <SettingsCard title="Appearance" Icon={Sun}>
      <div className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-ink">Theme</p>
            <p className="text-sm text-ink-muted">Light, dark, or as your device is set</p>
          </div>
          <div className="flex gap-1 p-1 bg-surface-2 rounded-lg">
            {THEMES.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                className={`flex items-center gap-1.5 px-3 py-1.5 max-md:min-h-11 text-sm rounded-md transition-colors ${
                  theme === value
                    ? 'bg-surface text-ink shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
                aria-label={`${label} theme`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
