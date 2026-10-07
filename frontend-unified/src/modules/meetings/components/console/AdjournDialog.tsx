import type { AgendaItem } from '@robbie-bylawyer/shared/types';
import Modal from '../../../../components/ui/Modal';

interface AdjournDialogProps {
  isOpen: boolean;
  agenda: AgendaItem[];
  onAdjourn: () => void;
  onKeepGoing: () => void;
}

/** Adjournment completes these too: the item before the meeting, and the "Adjournment" item */
const isAdjournment = (item: AgendaItem) => item.title.trim().toLowerCase() === 'adjournment';

/**
 * Adjourn asks first, naming the agenda items the meeting has not reached, by number: an
 * adjournment can't be taken back
 */
export function AdjournDialog({ isOpen, agenda, onAdjourn, onKeepGoing }: AdjournDialogProps) {
  const notReached = agenda
    .map((item, index) => ({ item, number: index + 1 }))
    .filter(({ item }) => item.status === 'pending' && !isAdjournment(item));

  return (
    <Modal isOpen={isOpen} onClose={onKeepGoing} title="Adjourn the meeting?" size="sm">
      <div className="space-y-4">
        {notReached.length > 0 ? (
          <div className="space-y-2">
            <p className="text-ink">Items not reached:</p>
            <ul className="space-y-1 text-sm text-ink-muted">
              {notReached.map(({ item, number }) => (
                <li key={item.id}>
                  {number}. {item.title}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-ink-muted">Every item on the agenda has been taken up.</p>
        )}
        <div className="flex justify-end gap-3 border-t border-rule pt-4">
          <button type="button" className="btn-secondary" onClick={onKeepGoing}>
            Keep going
          </button>
          <button type="button" className="btn-primary" onClick={onAdjourn}>
            Adjourn
          </button>
        </div>
      </div>
    </Modal>
  );
}
