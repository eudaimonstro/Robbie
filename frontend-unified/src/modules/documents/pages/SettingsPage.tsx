import { useState } from 'react';
import { Settings, Building2, Trash2, Sun, Moon, Monitor } from 'lucide-react';
import { useOrganization } from '../../../context/OrganizationContext';
import { useTheme } from '../../../context/ThemeContext';
import { organizations as organizationsApi } from '../../../api/client';
import Modal from '../../../components/ui/Modal';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../context/ToastContext';

export default function SettingsPage() {
  const { currentOrganization, refreshOrganizations, setCurrentOrganization } = useOrganization();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();

  // Edit organization
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete organization
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleEditOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !editName.trim()) return;

    try {
      setSaving(true);
      await organizationsApi.update(currentOrganization.id, { name: editName.trim() });
      await refreshOrganizations();
      setEditModalOpen(false);
      showToast('success', 'Organization updated');
    } catch {
      showToast('error', 'Failed to update organization');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrganization = async () => {
    if (!currentOrganization) return;

    try {
      setDeleting(true);
      await organizationsApi.delete(currentOrganization.id);
      setCurrentOrganization(null);
      await refreshOrganizations();
      setDeleteDialogOpen(false);
      showToast('success', 'Organization deleted');
    } catch {
      showToast('error', 'Failed to delete organization');
    } finally {
      setDeleting(false);
    }
  };

  const openEditModal = () => {
    if (currentOrganization) {
      setEditName(currentOrganization.name);
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
          Manage your organization settings
        </p>
      </div>

      {currentOrganization ? (
        <div className="space-y-6">
          {/* Organization Settings */}
          <div className="card">
            <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
              <h3 className="font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Organization
              </h3>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-secondary-500">Organization Name</p>
                  <p className="font-medium text-secondary-900 dark:text-white">
                    {currentOrganization.name}
                  </p>
                </div>
                <button onClick={openEditModal} className="btn-secondary btn-sm">
                  Edit
                </button>
              </div>
              <div>
                <p className="text-sm text-secondary-500">Created</p>
                <p className="text-secondary-700 dark:text-secondary-300">
                  {new Date(currentOrganization.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="card border-danger-200 dark:border-danger-900">
            <div className="px-6 py-4 border-b border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-900/20 rounded-t-lg">
              <h3 className="font-semibold text-danger-700 dark:text-danger-400">Danger Zone</h3>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between">
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
            </div>
          </div>

          {/* Appearance Settings */}
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
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                      theme === 'light'
                        ? 'bg-white dark:bg-secondary-700 text-secondary-900 dark:text-white shadow-xs'
                        : 'text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-white'
                    }`}
                    aria-label="Light theme"
                  >
                    <Sun className="w-4 h-4" />
                    Light
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                      theme === 'dark'
                        ? 'bg-white dark:bg-secondary-700 text-secondary-900 dark:text-white shadow-xs'
                        : 'text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-white'
                    }`}
                    aria-label="Dark theme"
                  >
                    <Moon className="w-4 h-4" />
                    Dark
                  </button>
                  <button
                    onClick={() => setTheme('system')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                      theme === 'system'
                        ? 'bg-white dark:bg-secondary-700 text-secondary-900 dark:text-white shadow-xs'
                        : 'text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-white'
                    }`}
                    aria-label="System theme"
                  >
                    <Monitor className="w-4 h-4" />
                    System
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* App Info */}
          <div className="card">
            <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
              <h3 className="font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
                <Settings className="w-5 h-5" />
                About Robbie-Bylawyer
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
                  Robbie-Bylawyer combines real-time parliamentary procedure management with
                  organizational bylaws version control.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card p-8 text-center">
            <Building2 className="w-12 h-12 text-secondary-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-2">
              No Organization Selected
            </h3>
            <p className="text-secondary-600 dark:text-secondary-400">
              Select an organization from the header dropdown to manage its settings.
            </p>
          </div>

          {/* Appearance Settings - always visible */}
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
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                      theme === 'light'
                        ? 'bg-white dark:bg-secondary-700 text-secondary-900 dark:text-white shadow-xs'
                        : 'text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-white'
                    }`}
                    aria-label="Light theme"
                  >
                    <Sun className="w-4 h-4" />
                    Light
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                      theme === 'dark'
                        ? 'bg-white dark:bg-secondary-700 text-secondary-900 dark:text-white shadow-xs'
                        : 'text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-white'
                    }`}
                    aria-label="Dark theme"
                  >
                    <Moon className="w-4 h-4" />
                    Dark
                  </button>
                  <button
                    onClick={() => setTheme('system')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                      theme === 'system'
                        ? 'bg-white dark:bg-secondary-700 text-secondary-900 dark:text-white shadow-xs'
                        : 'text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-white'
                    }`}
                    aria-label="System theme"
                  >
                    <Monitor className="w-4 h-4" />
                    System
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Organization"
      >
        <form onSubmit={handleEditOrganization}>
          <div className="mb-6">
            <label htmlFor="orgName" className="label">
              Organization Name
            </label>
            <input
              type="text"
              id="orgName"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="input"
              autoFocus
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

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteOrganization}
        title="Delete Organization"
        message={`Are you sure you want to delete "${currentOrganization?.name}"? This will permanently delete all documents, versions, amendments, and meetings. This action cannot be undone.`}
        confirmText="Delete Organization"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
