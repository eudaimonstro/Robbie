import React from 'react';
import { CheckCircle } from 'lucide-react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction } from '@robbie-bylawyer/shared/types';

interface MinutesApprovalPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}

export const MinutesApprovalPanel = React.memo(function MinutesApprovalPanel({
  state,
  dispatch,
}: MinutesApprovalPanelProps) {
  if (state.meetingStage !== 'minutes-approval') {
    return null;
  }

  if (state.minutesApproved) {
    return (
      <section
        className="bg-surface rounded-lg p-4 shadow-sm"
        aria-labelledby="minutes-approved-heading"
      >
        <div className="flex items-center gap-2 text-carried mb-2">
          <CheckCircle size={20} aria-hidden="true" />
          <h3 id="minutes-approved-heading" className="label-caps text-carried">
            Minutes approved
          </h3>
        </div>
        <p className="text-sm text-ink-muted">
          Minutes from the previous meeting have been approved. Click "Proceed to Next Stage" to
          continue.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-surface rounded-lg p-4 shadow-sm" aria-labelledby="minutes-heading">
      <h3 id="minutes-heading" className="label-caps mb-3">
        Minutes from the previous meeting
      </h3>
      <div className="bg-surface-2 rounded-lg p-4 mb-3 max-h-64 overflow-y-auto">
        <pre className="text-sm text-ink whitespace-pre-wrap font-sans">
          {state.minutesFromPreviousMeeting}
        </pre>
      </div>
      <p className="text-sm text-ink-muted mb-3">
        Say: "Are there any corrections to the minutes?"
      </p>
      <button
        onClick={() => dispatch({ type: 'APPROVE_MINUTES', timestamp: generateTimestamp() })}
        className="w-full bg-carried text-paper py-3 rounded-lg hover:bg-carried-700 dark:hover:bg-carried-300 font-medium"
      >
        Approve Minutes (No Corrections)
      </button>
      <p className="text-xs text-ink-muted mt-2 text-center">
        If corrections are needed, they should be made before approval
      </p>
    </section>
  );
});
