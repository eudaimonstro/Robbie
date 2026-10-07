import React from 'react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction } from '@robbie-bylawyer/shared/types';
import { MotionCard } from '../MotionCard';

interface PendingSecondPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}

export const PendingSecondPanel = React.memo(function PendingSecondPanel({
  state,
  dispatch,
}: PendingSecondPanelProps) {
  if (!state.pendingSecond) {
    return null;
  }

  return (
    <section
      className="bg-surface rounded-lg p-4 shadow-sm"
      aria-labelledby="pending-second-heading"
    >
      <h3 id="pending-second-heading" className="font-semibold mb-2 text-caution-ink">
        Awaiting Second
      </h3>
      <MotionCard motion={state.pendingSecond} />
      <button
        onClick={() => dispatch({ type: 'DECLINE_SECOND', timestamp: generateTimestamp() })}
        className="mt-3 w-full bg-rule text-ink py-2 rounded-lg"
      >
        Declare "No Second"
      </button>
    </section>
  );
});
