import React from 'react';
import { generateTimestamp, calculateTimerEnd } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction } from '@robbie-bylawyer/shared/types';
import { MotionCard } from '../MotionCard';

interface UnanimousConsentPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}

export const UnanimousConsentPanel = React.memo(function UnanimousConsentPanel({
  state,
  dispatch,
}: UnanimousConsentPanelProps) {
  if (!state.unanimousConsentPending || !state.currentMotion) {
    return null;
  }

  return (
    <section
      className="bg-surface rounded-lg p-4 shadow-sm"
      aria-labelledby="unanimous-consent-heading"
    >
      <h3 id="unanimous-consent-heading" className="font-semibold mb-3 text-ink">
        Unanimous Consent Requested
      </h3>
      <MotionCard motion={state.currentMotion} />

      <div className="mt-4 bg-carried-tint border border-carried/40 rounded-lg p-4">
        <p className="text-ink font-medium mb-2">Waiting for objections...</p>
        <p className="text-carried text-sm">If no one objects, motion passes without a vote.</p>
      </div>

      <div
        className={`mt-3 ${state.currentMotion?.vote === 'none' ? '' : 'grid grid-cols-2 gap-2'}`}
      >
        <button
          onClick={() =>
            dispatch({ type: 'UNANIMOUS_CONSENT_PASSED', timestamp: generateTimestamp() })
          }
          className="bg-carried text-paper py-3 rounded-lg font-medium w-full"
        >
          No Objection - Pass
        </button>
        {state.currentMotion?.vote !== 'none' && (
          <button
            onClick={() =>
              dispatch({
                type: 'OPEN_VOTING',
                voteTimerEnd: calculateTimerEnd(state.voteTimeLimit),
                timestamp: generateTimestamp(),
              })
            }
            className="bg-gavel text-paper py-3 rounded-lg font-medium"
          >
            Proceed to Vote
          </button>
        )}
      </div>
    </section>
  );
});
