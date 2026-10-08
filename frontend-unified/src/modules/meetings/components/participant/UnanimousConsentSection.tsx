import React from 'react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';

interface UnanimousConsentSectionProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  currentUser: Member;
}

/**
 * The chair asks for unanimous consent on the question above: without an objection it is
 * adopted, and one objection puts it to a vote
 */
export const UnanimousConsentSection = React.memo(function UnanimousConsentSection({
  state,
  dispatch,
  currentUser,
}: UnanimousConsentSectionProps) {
  return (
    <div className="space-y-3">
      <p className="label-caps">Unanimous consent</p>
      <p className="text-ink">
        The chair asks: is there any objection to &ldquo;{state.currentMotion?.text}&rdquo;?
      </p>
      <p className="text-sm text-ink-muted">
        Without an objection it is adopted. One objection puts it to a vote.
      </p>
      <button
        type="button"
        className="btn-primary btn-lg w-full"
        onClick={() =>
          dispatch({
            type: 'OBJECT_TO_CONSENT',
            objector: currentUser.name,
            timestamp: generateTimestamp(),
          })
        }
      >
        Object
      </button>
    </div>
  );
});
