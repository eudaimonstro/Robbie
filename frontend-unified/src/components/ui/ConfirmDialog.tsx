import { useRef } from 'react';
import Modal from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  loading = false,
}: ConfirmDialogProps) {
  // A dangerous action can't be undone: focus starts on Cancel
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      initialFocusRef={variant === 'danger' ? cancelRef : undefined}
    >
      <p className="text-ink-muted mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button ref={cancelRef} onClick={onClose} className="btn-ghost btn-sm" disabled={loading}>
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          className={`${variant === 'danger' ? 'btn-danger' : 'btn-primary'} btn-sm`}
          disabled={loading}
        >
          {loading ? 'Loading...' : confirmText}
        </button>
      </div>
    </Modal>
  );
}
