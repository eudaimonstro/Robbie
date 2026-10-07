import { useState } from 'react';
import Modal from '../../../components/ui/Modal';

interface DeleteOrganizationDialogProps {
  organizationName: string;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Deleting an organization can't be undone, so the owner types its name to confirm. Render it
 * only while open, so the typed name starts empty each time.
 */
export function DeleteOrganizationDialog({
  organizationName,
  deleting,
  onClose,
  onConfirm,
}: DeleteOrganizationDialogProps) {
  const [typed, setTyped] = useState('');
  return (
    <Modal isOpen onClose={onClose} title="Delete organization" size="sm">
      <p className="text-secondary-600 dark:text-secondary-400 mb-4">
        This permanently deletes {organizationName} with all its documents, versions, amendments,
        meeting records and files. It can't be undone.
      </p>
      <label htmlFor="confirmOrganizationName" className="label">
        Type <strong>{organizationName}</strong> to confirm
      </label>
      <input
        id="confirmOrganizationName"
        className="input mb-6"
        autoComplete="off"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn-ghost btn-sm" disabled={deleting}>
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="btn-danger btn-sm"
          disabled={deleting || typed !== organizationName}
        >
          {deleting ? 'Deleting...' : 'Delete organization'}
        </button>
      </div>
    </Modal>
  );
}
