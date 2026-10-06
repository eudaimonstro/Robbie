import { useState, useEffect } from 'react';
import Modal from '../../../components/ui/Modal';
import { SectionCreate, SectionUpdate } from '../../../api/client';

interface SectionEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: SectionCreate | SectionUpdate) => Promise<void>;
  section?: {
    id?: string;
    numberLabel: string | null;
    title: string | null;
    content: string | null;
    annotation: string | null;
  };
  parentLabel?: string;
  mode: 'create' | 'edit' | 'addChild';
}

export default function SectionEditor({
  isOpen,
  onClose,
  onSave,
  section,
  parentLabel,
  mode,
}: SectionEditorProps) {
  const [numberLabel, setNumberLabel] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [annotation, setAnnotation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Validation: require numberLabel and title for new sections, allow editing without
  const isCreateMode = mode === 'create' || mode === 'addChild';
  const isValid = isCreateMode
    ? numberLabel.trim() !== '' && title.trim() !== ''
    : title.trim() !== '' || content.trim() !== '' || numberLabel.trim() !== '';

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && section) {
        setNumberLabel(section.numberLabel || '');
        setTitle(section.title || '');
        setContent(section.content || '');
        setAnnotation(section.annotation || '');
      } else {
        setNumberLabel('');
        setTitle('');
        setContent('');
        setAnnotation('');
      }
      setError(null);
      setValidationError(null);
    }
  }, [isOpen, section, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidationError(null);

    // Validate required fields
    if (!isValid) {
      if (isCreateMode) {
        setValidationError('Section number and title are required.');
      } else {
        setValidationError('Please provide at least a section number, title, or content.');
      }
      return;
    }

    try {
      setSaving(true);
      const data: SectionCreate | SectionUpdate = {
        numberLabel: numberLabel.trim() || undefined,
        title: title.trim() || undefined,
        content: content.trim() || undefined,
        annotation: annotation.trim() || undefined,
      };
      await onSave(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save section');
    } finally {
      setSaving(false);
    }
  };

  const titles = {
    create: 'Add New Section',
    edit: 'Edit Section',
    addChild: parentLabel ? `Add Child to ${parentLabel}` : 'Add Child Section',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={titles[mode]} size="lg">
      <form onSubmit={handleSubmit}>
        {(error || validationError) && (
          <div className="mb-4 p-3 bg-danger-50 border border-danger-200 rounded-md text-danger-700 text-sm">
            {error || validationError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="numberLabel" className="label">
              Section Number {isCreateMode && <span className="text-danger-500">*</span>}
            </label>
            <input
              type="text"
              id="numberLabel"
              value={numberLabel}
              onChange={(e) => setNumberLabel(e.target.value)}
              className="input"
              placeholder="e.g., Article I, Section 1.1"
              required={isCreateMode}
            />
          </div>
          <div>
            <label htmlFor="title" className="label">
              Title {isCreateMode && <span className="text-danger-500">*</span>}
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="e.g., Name and Purpose"
              required={isCreateMode}
            />
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="content" className="label">
            Content
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="textarea h-40"
            placeholder="Enter section content (Markdown supported)"
          />
          <p className="text-xs text-secondary-500 mt-1">Markdown formatting is supported</p>
        </div>

        <div className="mb-6">
          <label htmlFor="annotation" className="label">
            Annotation (optional)
          </label>
          <textarea
            id="annotation"
            value={annotation}
            onChange={(e) => setAnnotation(e.target.value)}
            className="textarea h-20"
            placeholder="Add notes or commentary about this section"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost" disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving || !isValid}>
            {saving ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Add Section'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
