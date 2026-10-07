import React from 'react';
import { Info } from 'lucide-react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';

interface UnanimousConsentSectionProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  currentUser: Member;
}

export const UnanimousConsentSection = React.memo(function UnanimousConsentSection({
  state,
  dispatch,
  currentUser,
}: UnanimousConsentSectionProps) {
  return (
    <div className="space-y-3">
      <div className="bg-carried-tint border-2 border-carried/40 rounded-lg p-4">
        <p className="text-ink font-semibold mb-2 flex items-center gap-2">
          <Info size={18} aria-hidden="true" /> Unanimous Consent Requested
        </p>
        <p className="text-ink mb-2">"{state.currentMotion?.text}"</p>
        <p className="text-sm text-ink-muted mb-3">Chair is asking: "Is there any objection?"</p>
        <p className="text-xs text-ink-muted bg-surface p-2 rounded-sm">
          If no one objects, this motion will pass without a vote.
        </p>
      </div>
      <button
        onClick={() =>
          dispatch({
            type: 'OBJECT_TO_CONSENT',
            objector: currentUser.name,
            timestamp: generateTimestamp(),
          })
        }
        className="w-full min-h-[56px] bg-gavel text-paper py-4 rounded-xl hover:bg-gavel-700 dark:hover:bg-gavel-300 font-semibold text-lg touch-manipulation active:scale-[0.98] transition-transform focus:outline-hidden focus:ring-2 focus:ring-gavel focus:ring-offset-2"
      >
        I Object!
      </button>
    </div>
  );
});
