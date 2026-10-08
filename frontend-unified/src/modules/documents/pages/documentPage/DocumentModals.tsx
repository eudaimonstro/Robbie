import { useState } from 'react';
import Modal from '../../../../components/ui/Modal';
import type { VersionCreate } from '../../../../api/client';

interface CreateVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: VersionCreate) => Promise<void>;
}

export function CreateVersionModal({ isOpen, onClose, onSubmit }: CreateVersionModalProps) {
  const [notes, setNotes] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setNotes('');
    setEffectiveDate('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      await onSubmit({
        effectiveDate: effectiveDate || undefined,
        notes: notes.trim() || undefined,
      });
      reset();
      onClose();
    } catch {
      // Error handled by parent
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New version">
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-ink-muted mb-4">
          Create a new version to make changes to the document. The current version will be
          preserved.
        </p>
        <div className="mb-4">
          <label htmlFor="versionEffectiveDate" className="label">
            Effective date (optional)
          </label>
          <input
            id="versionEffectiveDate"
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className="input"
          />
        </div>
        <div className="mb-4">
          <label htmlFor="versionNotes" className="label">
            Notes (optional)
          </label>
          <textarea
            id="versionNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="textarea h-24"
            placeholder="What this version changes"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={handleClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? 'Creating...' : 'Create version'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface CreateAmendmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, description?: string) => Promise<void>;
}

export function CreateAmendmentModal({ isOpen, onClose, onSubmit }: CreateAmendmentModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      setCreating(true);
      await onSubmit(title.trim(), description.trim() || undefined);
      setTitle('');
      setDescription('');
      onClose();
    } catch {
      // Error handled by parent
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Propose an amendment">
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="amendmentTitle" className="label">
            Title
          </label>
          <input
            type="text"
            id="amendmentTitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            placeholder="e.g. Lower the quorum"
            autoFocus
          />
        </div>
        <div className="mb-6">
          <label htmlFor="amendmentDescription" className="label">
            Why (optional)
          </label>
          <textarea
            id="amendmentDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="textarea h-24"
            placeholder="What the change does, and why"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={handleClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!title.trim() || creating}>
            {creating ? 'Creating...' : 'Create amendment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
