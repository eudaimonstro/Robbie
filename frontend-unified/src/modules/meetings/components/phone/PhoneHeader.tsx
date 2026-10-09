import { useState } from 'react';
import { LogOut, Menu } from 'lucide-react';
import { RoleBadge } from '../../../../components/ui/Badge';
import ConfirmDialog from '../../../../components/ui/ConfirmDialog';

interface PhoneHeaderProps {
  title: string;
  /** Where the meeting is: the agenda item before it, "In session", "Adjourned" */
  item: string | null;
  guest: boolean;
  /** A board meeting's observer: an Observer badge */
  observer?: boolean;
  /** Leave the meeting and return to the app (a live meeting hides the app's sidebar) */
  onLeave?: () => void;
  /** Ask first: a member leaving a meeting in session stops counting toward the quorum */
  confirmLeave?: boolean;
  /** Open the app's drawer: on a phone this header stands in for the app's */
  onMenu?: () => void;
}

/**
 * The phone's sticky header: the meeting, the current item, a Guest badge for guests, Leave, and
 * on a phone (where the app's header steps aside) the menu button
 */
export function PhoneHeader({
  title,
  item,
  guest,
  observer = false,
  onLeave,
  confirmLeave = false,
  onMenu,
}: PhoneHeaderProps) {
  const [asking, setAsking] = useState(false);
  return (
    // The app's main area scrolls inside its padding: the negative top meets its edge, so nothing
    // shows above the header while it is stuck
    <header className="sticky -top-4 z-10 border-b border-rule bg-paper/95 py-3 backdrop-blur md:-top-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {onMenu && (
            <button
              type="button"
              className="-ml-2 rounded-md p-2 text-ink-muted hover:bg-surface-2 hover:text-ink md:hidden"
              aria-label="Open menu"
              onClick={onMenu}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <h2 className="truncate font-serif-soft text-lg font-semibold text-ink">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {guest && <RoleBadge role="guest" />}
          {observer && <RoleBadge role="observer" />}
          {onLeave && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              aria-label="Leave meeting"
              title="Leave the meeting and return to the app"
              onClick={confirmLeave ? () => setAsking(true) : onLeave}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Leave
            </button>
          )}
        </div>
      </div>
      <p className="truncate text-sm text-ink-muted">{item ?? 'No item is before the meeting'}</p>
      {onLeave && (
        <ConfirmDialog
          isOpen={asking}
          onClose={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            onLeave();
          }}
          title="Leave the meeting?"
          message="You won't count toward the quorum."
          confirmText="Leave"
          cancelText="Stay"
        />
      )}
    </header>
  );
}
