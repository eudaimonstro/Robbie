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
  hasQuorum,
}: QuorumWarningProps) {
  if (hasQuorum) return null;

  return (
    <div
      className="bg-caution-tint border-l-4 border-caution p-4 mb-4 rounded-r-lg"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-caution-ink shrink-0" aria-hidden="true" />
        <div>
          <h4 className="text-ink font-semibold">Quorum Not Present</h4>
          <p className="text-ink text-sm">
            Only {presentCount} of {quorum} required members are present. The meeting may continue,
            but some actions may not be valid without quorum.
          </p>
        </div>
      </div>
    </div>
  );
});
