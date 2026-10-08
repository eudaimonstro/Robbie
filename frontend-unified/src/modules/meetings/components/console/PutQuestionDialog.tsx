import { useId, useState, type FormEvent } from 'react';
import { MAX_MOTION_TEXT_LENGTH } from '@robbie-bylawyer/shared/constants';
import Modal from '../../../../components/ui/Modal';

interface PutQuestionDialogProps {
  isOpen: boolean;
  /** The agenda item the question is on */
  item: string | null;
  onPut: (text: string) => void;
  onClose: () => void;
}

/**
 * The chair puts a question on the agenda item, in words the chair writes: put by the chair, it
 * needs no mover and no second. A report is received without a vote, so it needs none.
 */
export function PutQuestionDialog({ isOpen, item, onPut, onClose }: PutQuestionDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Put a question" size="sm">
      {/* Mounted only while open, so each question starts from an empty form */}
      {isOpen && <QuestionForm item={item} onPut={onPut} onClose={onClose} />}
    </Modal>
  );
}

function QuestionForm({ item, onPut, onClose }: Omit<PutQuestionDialogProps, 'isOpen'>) {
  const id = useId();
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) onPut(text.trim());
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor={id} className="label">
          The question
        </label>
        <textarea
          id={id}
          className="textarea"
          rows={3}
          maxLength={MAX_MOTION_TEXT_LENGTH}
          placeholder={item ? `That the meeting approve the ${item}` : 'That the meeting...'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <p className="text-sm text-ink-muted">
        A report is received without a vote: complete the item instead.
      </p>
      <div className="flex justify-end gap-3 border-t border-rule pt-4">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={!text.trim()}>
          Put the question
        </button>
      </div>
    </form>
  );
}
