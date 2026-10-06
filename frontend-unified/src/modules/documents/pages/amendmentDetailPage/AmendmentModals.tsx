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
      // An empty description clears it (leaving it out would keep the old one)
      await onSubmit(title.trim(), description.trim());
      onClose();
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  };

  // Start from the saved values each time the modal opens. (Comparing the title to the saved
  // one instead would undo every keystroke in the title field.)
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setTitle(initialTitle);
      setDescription(initialDescription);
    }
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
      // Send only the fields shown for this type, so text typed before switching type isn't
      // applied (for an add, the target is the parent section)
      const shows = {
        number: changeType !== 'delete',
        title: changeType === 'add' || changeType === 'modify',
        content: changeType === 'add' || changeType === 'modify',
      };
      await onSubmit({
        changeType: changeType,
        targetSectionId: targetSectionId || undefined,
        ...(shows.content && { newContent: newContent.trim() || undefined }),
        ...(shows.title && { newTitle: newTitle.trim() || undefined }),
        ...(shows.number && { newNumberLabel: newNumberLabel.trim() || undefined }),
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
          <label htmlFor="changeType" className="label">
            Change Type
          </label>
          <select
            id="changeType"
            value={changeType}
            onChange={(e) => {
              const next = e.target.value as AmendmentChangeCreate['changeType'];
              // The section means the parent for an add and the target otherwise, so a
              // choice made for one doesn't carry over to the other
              if ((next === 'add') !== (changeType === 'add')) setTargetSectionId('');
              setChangeType(next);
            }}
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
            <label htmlFor="targetSection" className="label">
              Target Section
            </label>
            <select
              id="targetSection"
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

        {changeType === 'add' && (
          <div className="mb-4">
            <label htmlFor="addUnder" className="label">
              Add Under
            </label>
            <select
              id="addUnder"
              value={targetSectionId}
              onChange={(e) => setTargetSectionId(e.target.value)}
              className="select"
            >
              <option value="">Top level</option>
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
                <label htmlFor="newNumberLabel" className="label">
                  Section Number
                </label>
                <input
                  id="newNumberLabel"
                  type="text"
                  value={newNumberLabel}
                  onChange={(e) => setNewNumberLabel(e.target.value)}
                  className="input"
                  placeholder="e.g., Section 1.3"
                />
              </div>
              {changeType !== 'renumber' && (
                <div>
                  <label htmlFor="newTitle" className="label">
                    Section Title
                  </label>
                  <input
                    id="newTitle"
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="input"
                    placeholder="e.g., New Membership Dues"
                  />
                </div>
              )}
            </div>

            {changeType !== 'renumber' && (
              <div className="mb-6">
                <label htmlFor="newContent" className="label">
                  Content
                </label>
                <textarea
                  id="newContent"
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
