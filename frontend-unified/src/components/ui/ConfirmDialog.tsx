import Modal from './Modal'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'primary'
  loading?: boolean
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
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-secondary-600 dark:text-secondary-400 mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onClose}
          className="btn-ghost btn-sm"
          disabled={loading}
        >
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
  )
}
