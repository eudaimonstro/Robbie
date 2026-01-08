import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface QuorumWarningProps {
  presentCount: number;
  quorum: number;
  hasQuorum: boolean;
}

/**
 * Warning banner displayed when quorum is lost
 * Shows current attendance vs required quorum
 */
export const QuorumWarning = React.memo(function QuorumWarning({
  presentCount,
  quorum,
  hasQuorum
}: QuorumWarningProps) {
  if (hasQuorum) return null;

  return (
    <div
      className="bg-accent-50 dark:bg-accent-900/20 border-l-4 border-accent-400 dark:border-accent-600 p-4 mb-4 rounded-r-lg"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-accent-600 dark:text-accent-400 flex-shrink-0" aria-hidden="true" />
        <div>
          <h4 className="text-accent-800 dark:text-accent-300 font-semibold">Quorum Not Present</h4>
          <p className="text-accent-700 dark:text-accent-400 text-sm">
            Only {presentCount} of {quorum} required members are present.
            The meeting may continue, but some actions may not be valid without quorum.
          </p>
        </div>
      </div>
    </div>
  );
});
