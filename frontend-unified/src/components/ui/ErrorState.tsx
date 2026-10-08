import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  /** What couldn't be done, as a sentence: "Couldn't load the bylaws." */
  title: string;
  /** What to do about it, when there is more to say than Try again */
  description?: string;
  /** Load it again; shows Try again */
  onRetry?: () => void;
  /** A way elsewhere, under the message (a link back) */
  children?: ReactNode;
  /** Inside a card that is already there: no card of its own, less room */
  inline?: boolean;
}

/**
 * A load that failed, said plainly, with Try again: never an empty list or "not found" standing
 * in for a server that didn't answer
 */
export default function ErrorState({
  title,
  description,
  onRetry,
  children,
  inline = false,
}: ErrorStateProps) {
  return (
    <div role="alert" className={inline ? 'px-4 py-6 text-center' : 'card p-8 text-center'}>
      <p className={inline ? 'text-sm text-ink' : 'font-medium text-ink'}>{title}</p>
      {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      {(onRetry || children) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          {onRetry && (
            <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
