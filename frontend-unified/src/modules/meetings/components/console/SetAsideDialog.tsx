import Modal from '../../../../components/ui/Modal';

interface SetAsideDialogProps {
  isOpen: boolean;
  /** The office the election is for */
  position: string | null;
  onSetAside: () => void;
  onKeepGoing: () => void;
}

/**
 * Setting an election aside asks first: it ends the election without a result. The nominations
 * made stand, and come back if nominations open again for the same office.
 */
export function SetAsideDialog({ isOpen, position, onSetAside, onKeepGoing }: SetAsideDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onKeepGoing} title="Set the election aside?" size="sm">
      <div className="space-y-4">
        <p className="text-ink">
          {position ? `The election for ${position} ends` : 'The election ends'} without a result.
          The nominations made stand if nominations open again for it.
        </p>
        <div className="flex justify-end gap-3 border-t border-rule pt-4">
          <button type="button" className="btn-secondary" onClick={onKeepGoing}>
            Keep going
          </button>
          <button type="button" className="btn-primary" onClick={onSetAside}>
            Set it aside
          </button>
        </div>
      </div>
    </Modal>
  );
}
