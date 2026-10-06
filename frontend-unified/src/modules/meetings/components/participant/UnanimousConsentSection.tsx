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
      <div className="bg-success-50 dark:bg-success-900/20 border-2 border-success-300 dark:border-success-700 rounded-lg p-4">
        <p className="text-success-800 dark:text-success-300 font-semibold mb-2 flex items-center gap-2">
          <Info size={18} aria-hidden="true" /> Unanimous Consent Requested
        </p>
        <p className="text-secondary-800 dark:text-secondary-200 mb-2">
          "{state.currentMotion?.text}"
        </p>
        <p className="text-sm text-secondary-600 dark:text-secondary-400 mb-3">
          Chair is asking: "Is there any objection?"
        </p>
        <p className="text-xs text-success-700 dark:text-success-400 bg-success-100 dark:bg-success-900/40 p-2 rounded-sm">
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
        className="w-full min-h-[56px] bg-danger-500 text-white py-4 rounded-xl hover:bg-danger-600 font-semibold text-lg touch-manipulation active:scale-[0.98] transition-transform focus:outline-hidden focus:ring-2 focus:ring-danger-400 focus:ring-offset-2"
      >
        I Object!
      </button>
    </div>
  );
});
