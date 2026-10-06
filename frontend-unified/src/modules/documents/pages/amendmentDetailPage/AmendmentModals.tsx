import { useState } from 'react';
import Modal from '../../../../components/ui/Modal';
import { AmendmentChangeCreate, SectionTree } from '../../../../api/client';
import { flattenSections } from './useAmendmentData';

interface EditAmendmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, description?: string) => Promise<void>;
  initialTitle: string;
  initialDescription: string;
}

export function EditAmendmentModal({
  isOpen,
  onClose,
  onSubmit,
  initialTitle,
  initialDescription,
}: EditAmendmentModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await onSubmit(title.trim(), description.trim() || undefined);
      onClose();
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  };

  // Sync state when modal opens with new values
  if (isOpen && title !== initialTitle && !saving) {
    setTitle(initialTitle);
    setDescription(initialDescription);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Amendment">
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="editTitle" className="label">
            Title
          </label>
          <input
            type="text"
            id="editTitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
          />
        </div>
        <div className="mb-6">
          <label htmlFor="editDescription" className="label">
            Description
          </label>
          <textarea
            id="editDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="textarea h-24"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!title.trim() || saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface AddChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: AmendmentChangeCreate) => Promise<void>;
  sectionTree: SectionTree[];
}

export function AddChangeModal({ isOpen, onClose, onSubmit, sectionTree }: AddChangeModalProps) {
  const [changeType, setChangeType] = useState<AmendmentChangeCreate['changeType']>('modify');
  const [targetSectionId, setTargetSectionId] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newNumberLabel, setNewNumberLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const resetForm = () => {
    setChangeType('modify');
    setTargetSectionId('');
    setNewContent('');
    setNewTitle('');
    setNewNumberLabel('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setAdding(true);
      await onSubmit({
        changeType: changeType,
        targetSectionId: targetSectionId || undefined,
        newContent: newContent.trim() || undefined,
        newTitle: newTitle.trim() || undefined,
        newNumberLabel: newNumberLabel.trim() || undefined,
      });
      resetForm();
      onClose();
    } catch {
      // Error handled by parent
    } finally {
      setAdding(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const flatSections = flattenSections(sectionTree);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Change" size="lg">
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="label">Change Type</label>
          <select
            value={changeType}
            onChange={(e) => setChangeType(e.target.value as AmendmentChangeCreate['changeType'])}
            className="select"
          >
            <option value="add">Add new section</option>
            <option value="modify">Modify existing section</option>
            <option value="delete">Delete section</option>
            <option value="renumber">Renumber section</option>
          </select>
        </div>

        {(changeType === 'modify' || changeType === 'delete' || changeType === 'renumber') && (
          <div className="mb-4">
            <label className="label">Target Section</label>
            <select
              value={targetSectionId}
              onChange={(e) => setTargetSectionId(e.target.value)}
              className="select"
              required
            >
              <option value="">Select a section...</option>
              {flatSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {changeType !== 'delete' && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="label">Section Number</label>
                <input
                  type="text"
                  value={newNumberLabel}
                  onChange={(e) => setNewNumberLabel(e.target.value)}
                  className="input"
                  placeholder="e.g., Section 1.3"
                />
              </div>
              <div>
                <label className="label">Section Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="input"
                  placeholder="e.g., New Membership Dues"
                />
              </div>
            </div>

            {changeType !== 'renumber' && (
              <div className="mb-6">
                <label className="label">Content</label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="textarea h-32"
                  placeholder="Enter the new section content..."
                />
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={handleClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={adding}>
            {adding ? 'Adding...' : 'Add Change'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
