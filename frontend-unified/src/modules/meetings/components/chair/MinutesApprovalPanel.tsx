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
        className="bg-white rounded-lg p-4 shadow"
        aria-labelledby="minutes-approved-heading"
      >
        <div className="flex items-center gap-2 text-green-700 mb-2">
          <CheckCircle size={20} aria-hidden="true" />
          <h3 id="minutes-approved-heading" className="font-semibold">
            Minutes Approved
          </h3>
        </div>
        <p className="text-sm text-gray-600">
          Minutes from the previous meeting have been approved. Click "Proceed to Next Stage" to
          continue.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-lg p-4 shadow" aria-labelledby="minutes-heading">
      <h3 id="minutes-heading" className="font-semibold mb-3 text-gray-800">
        <span aria-hidden="true">📝</span> Minutes from Previous Meeting
      </h3>
      <div className="bg-gray-50 rounded-lg p-4 mb-3 max-h-64 overflow-y-auto">
        <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
          {state.minutesFromPreviousMeeting}
        </pre>
      </div>
      <p className="text-sm text-gray-600 mb-3">Say: "Are there any corrections to the minutes?"</p>
      <button
        onClick={() => dispatch({ type: 'APPROVE_MINUTES', timestamp: generateTimestamp() })}
        className="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 font-medium"
      >
        Approve Minutes (No Corrections)
      </button>
      <p className="text-xs text-gray-500 mt-2 text-center">
        If corrections are needed, they should be made before approval
      </p>
    </section>
  );
});
