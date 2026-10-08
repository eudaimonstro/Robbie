import { useRef } from 'react';
import Modal from '../../../../components/ui/Modal';

interface NoQuorumDialogProps {
  isOpen: boolean;
  /** "7 present, 29 needed" */
  attendance: string;
  onOpen: () => void;
  onWait: () => void;
}

/**
 * Opening a vote without a quorum asks first (RONR 40:6): business done without one is not
 * valid, and the minutes say so. Adjourning and recessing need no quorum and don't ask.
 */
export function NoQuorumDialog({ isOpen, attendance, onOpen, onWait }: NoQuorumDialogProps) {
  // Waiting is the safe answer: focus starts there
  const waitRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      isOpen={isOpen}
      onClose={onWait}
      title="There is no quorum"
      size="sm"
      initialFocusRef={waitRef}
    >
      <div className="space-y-4">
        <p className="font-semibold text-caution-ink">{attendance}</p>
        <p className="text-ink">
          There is no quorum. Business done now is not valid. Open the vote anyway?
        </p>
        <p className="text-sm text-ink-muted">
          The minutes will say it has no effect unless a meeting with a quorum ratifies it.
        </p>
        <div className="flex justify-end gap-3 border-t border-rule pt-4">
          <button ref={waitRef} type="button" className="btn-secondary" onClick={onWait}>
            Wait for a quorum
          </button>
          <button type="button" className="btn-primary" onClick={onOpen}>
            Open the vote anyway
          </button>
        </div>
      </div>
    </Modal>
  );
}
