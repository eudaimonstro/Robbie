import { useState } from 'react';
import { Settings, Building2, UserCircle, Trash2, Sun, Moon, Monitor, LogOut } from 'lucide-react';
import { useCan, useOrganization } from '../../../context/OrganizationContext';
import { useSession } from '../../../context/SessionContext';
import { useTheme } from '../../../context/ThemeContext';
import { members as membersApi, organizations as organizationsApi } from '../../../api/client';
import Modal from '../../../components/ui/Modal';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../context/ToastContext';
import { NoOrganizations } from '../../../components/organizations/NoOrganizations';
import { MembersCard } from '../components/MembersCard';
import { DeleteOrganizationDialog } from '../components/DeleteOrganizationDialog';

const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export default function SettingsPage() {
  const { currentOrganization, refreshOrganizations, setCurrentOrganization } = useOrganization();
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
      showToast('error', messageOf(err, 'Failed to update your name'));
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
      showToast('error', messageOf(err, 'Failed to update organization'));
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
      setCurrentOrganization(null);
      await refreshOrganizations();
      showToast('success', `You left ${name}`);
    } catch (err) {
      // The last owner can't leave: "An organization needs at least one owner"
      setLeaveDialogOpen(false);
      showToast('error', messageOf(err, 'Failed to leave the organization'));
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
      setCurrentOrganization(null);
      await refreshOrganizations();
      showToast('success', 'Organization deleted');
    } catch (err) {
      showToast('error', messageOf(err, 'Failed to delete organization'));
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
        <h2 className="text-2xl font-heading font-bold text-secondary-900 dark:text-white">
          Settings
        </h2>
        <p className="text-secondary-600 dark:text-secondary-400 mt-1">
          Your name, your organization and its members
        </p>
      </div>

      {/* Your name */}
      <div className="card mb-6">
        <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
          <h3 className="font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
            <UserCircle className="w-5 h-5" />
            Your name
          </h3>
        </div>
        <form onSubmit={handleSaveName} className="p-6">
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
          <p className="text-sm text-secondary-500 mt-1">Shown to others in meetings.</p>
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
      </div>

      {currentOrganization ? (
        <div className="space-y-6">
          {/* Organization */}
          <div className="card">
            <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
              <h3 className="font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Organization
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-secondary-500">Organization Name</p>
                  <p className="font-medium text-secondary-900 dark:text-white">
                    {currentOrganization.name}
                  </p>
                </div>
                {isAdmin && (
                  <button onClick={openEditModal} className="btn-secondary btn-sm">
                    Edit
                  </button>
                )}
              </div>
              {currentOrganization.description && (
                <div>
                  <p className="text-sm text-secondary-500">Description</p>
                  <p className="text-secondary-700 dark:text-secondary-300">
                    {currentOrganization.description}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-secondary-500">Created</p>
                <p className="text-secondary-700 dark:text-secondary-300">
                  {new Date(currentOrganization.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          <MembersCard />

          {/* Danger Zone */}
          <div className="card border-danger-200 dark:border-danger-900">
            <div className="px-6 py-4 border-b border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-900/20 rounded-t-lg">
              <h3 className="font-semibold text-danger-700 dark:text-danger-400">Danger Zone</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-secondary-900 dark:text-white">
                    Leave Organization
                  </p>
                  <p className="text-sm text-secondary-500">
                    You lose access to its documents and meetings. Its last owner can't leave.
                  </p>
                </div>
                <button onClick={() => setLeaveDialogOpen(true)} className="btn-secondary btn-sm">
                  <LogOut className="w-4 h-4 mr-1" />
                  Leave
                </button>
              </div>
              {isOwner && (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-secondary-900 dark:text-white">
                      Delete Organization
                    </p>
                    <p className="text-sm text-secondary-500">
                      Permanently delete this organization and all its data
                    </p>
                  </div>
                  <button onClick={() => setDeleteDialogOpen(true)} className="btn-danger btn-sm">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          <AppearanceCard />

          {/* App Info */}
          <div className="card">
            <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
              <h3 className="font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
                <Settings className="w-5 h-5" />
                About Robbie
              </h3>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-secondary-500">Version</span>
                <span className="text-sm text-secondary-700 dark:text-secondary-300">1.0.0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-secondary-500">Environment</span>
                <span className="text-sm text-secondary-700 dark:text-secondary-300">
                  Development
                </span>
              </div>
              <div className="pt-3 border-t border-secondary-200 dark:border-secondary-700">
                <p className="text-sm text-secondary-500">
                  Robbie runs meetings by Robert's Rules of Order and keeps your organization's
                  bylaws, with every version and amendment.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <NoOrganizations />
          <AppearanceCard />
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Organization"
      >
        <form onSubmit={handleEditOrganization}>
          <div className="mb-4">
            <label htmlFor="orgName" className="label">
              Organization Name
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
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Leave Confirmation */}
      <ConfirmDialog
        isOpen={leaveDialogOpen}
        onClose={() => setLeaveDialogOpen(false)}
        onConfirm={handleLeave}
        title="Leave Organization"
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

const THEMES = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const;

/** Light, dark or the system's color scheme */
function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
        <h3 className="font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
          <Sun className="w-5 h-5" />
          Appearance
        </h3>
      </div>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-secondary-900 dark:text-white">Theme</p>
            <p className="text-sm text-secondary-500">Choose your preferred color scheme</p>
          </div>
          <div className="flex gap-1 p-1 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
            {THEMES.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                  theme === value
                    ? 'bg-white dark:bg-secondary-700 text-secondary-900 dark:text-white shadow-xs'
                    : 'text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-white'
                }`}
                aria-label={`${label} theme`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
