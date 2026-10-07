import React from 'react';
import { AlertCircle } from 'lucide-react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import { MotionCard } from '../MotionCard';

interface PendingSecondSectionProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  currentUser: Member;
}

export const PendingSecondSection = React.memo(function PendingSecondSection({
  state,
  dispatch,
  currentUser,
}: PendingSecondSectionProps) {
  const pendingSecond = state.pendingSecond;

  if (!pendingSecond) {
    return null;
  }

  return (
    <div className="space-y-3">
      {state.motionStack.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-ink-muted uppercase mb-1">Pending Question</p>
          <MotionCard motion={state.motionStack[state.motionStack.length - 1]} />
        </div>
      )}
      <div className="bg-caution-tint border-2 border-caution/40 rounded-lg p-4">
        <p className="text-ink font-semibold mb-2 flex items-center gap-2">
          <AlertCircle size={18} aria-hidden="true" /> Awaiting Second
        </p>
        <p className="text-ink">"{pendingSecond.text}"</p>
        <p className="text-sm text-ink-muted mt-1">
          {pendingSecond.name} by {pendingSecond.mover}
        </p>
      </div>
      {pendingSecond.moverId === currentUser.id ? (
        <div className="bg-gavel-tint border border-gavel/30 rounded-lg p-4 text-center">
          <p className="text-ink font-medium mb-1">You moved this motion</p>
          <p className="text-ink-muted text-sm">
            Under Robert's Rules, you cannot second your own motion. Waiting for another member to
            second.
          </p>
        </div>
      ) : (
        <button
          onClick={() =>
            dispatch({
              type: 'SECOND_MOTION',
              seconder: currentUser.name,
              timestamp: generateTimestamp(),
            })
          }
          className="w-full min-h-[56px] bg-gavel text-paper py-4 rounded-xl hover:bg-gavel/90 font-semibold text-lg touch-manipulation active:scale-[0.98] transition-transform focus:outline-hidden focus:ring-2 focus:ring-gavel focus:ring-offset-2"
        >
          I Second This Motion
        </button>
      )}
    </div>
  );
});
