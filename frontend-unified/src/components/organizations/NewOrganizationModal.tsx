import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Modal from '../ui/Modal';
import { organizations } from '../../api/client';
import { useOrganization } from '../../context/OrganizationContext';
import { useToast } from '../../context/ToastContext';
import { showsOneOrganizationsRecord } from '../../utils/organizationPages';

/** Create an organization with the signed-in user as its owner, and switch to it */
export function NewOrganizationModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshOrganizations, setCurrentOrganization } = useOrganization();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setName('');
    setDescription('');
    setError(null);
    onClose();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      // No slug: the server makes one from the name
      const created = await organizations.create({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      await refreshOrganizations();
      // A document, amendment or meeting page belongs to the organization being left
      if (showsOneOrganizationsRecord(location.pathname)) navigate('/');
      setCurrentOrganization(created);
      showToast('success', `Created ${created.name}`);
      close();
    } catch (err) {
      // For example "You can own at most 3 organizations". A taken name comes back as its slug
      // ("Organization with slug 'x' already exists"), which the user never saw.
      const message = err instanceof Error ? err.message : 'Failed to create the organization';
      setError(/slug/i.test(message) ? 'An organization with that name already exists' : message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="New organization">
      <form onSubmit={onSubmit}>
        <div className="mb-4">
          <label htmlFor="newOrgName" className="label">
            Name
          </label>
          <input
            id="newOrgName"
            className="input"
            maxLength={200}
            placeholder="e.g., Maple Grove HOA"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="mb-4">
          <label htmlFor="newOrgDescription" className="label">
            Description (optional)
          </label>
          <textarea
            id="newOrgDescription"
            className="textarea h-24"
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="mb-4 text-sm text-danger-600 dark:text-danger-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={close} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!name.trim() || creating}>
            {creating ? 'Creating...' : 'Create organization'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
