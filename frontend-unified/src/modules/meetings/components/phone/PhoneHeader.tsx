import { LogOut } from 'lucide-react';
import { RoleBadge } from '../../../../components/ui/Badge';

interface PhoneHeaderProps {
  title: string;
  /** The agenda item before the meeting */
  item: string | null;
  guest: boolean;
  /** Leave the meeting and return to the app (a live meeting hides the app's sidebar) */
  onLeave?: () => void;
}

/** The phone's sticky header: the meeting, the current item, and a Guest badge for guests */
export function PhoneHeader({ title, item, guest, onLeave }: PhoneHeaderProps) {
  return (
    // The app's main area scrolls inside its padding: the negative top meets its edge, so nothing
    // shows above the header while it is stuck
    <header className="sticky -top-4 z-10 border-b border-rule bg-paper/95 py-3 backdrop-blur md:-top-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate font-serif-soft text-lg font-semibold text-ink">{title}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {guest && <RoleBadge role="guest" />}
          {onLeave && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              aria-label="Leave meeting"
              title="Leave the meeting and return to the app"
              onClick={onLeave}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Leave
            </button>
          )}
        </div>
      </div>
      <p className="truncate text-sm text-ink-muted">{item ?? 'No item is before the meeting'}</p>
    </header>
  );
}
