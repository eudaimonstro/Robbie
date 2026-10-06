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
          <p className="text-xs text-secondary-500 dark:text-secondary-400 uppercase mb-1">
            Pending Question
          </p>
          <MotionCard motion={state.motionStack[state.motionStack.length - 1]} />
        </div>
      )}
      <div className="bg-accent-50 dark:bg-accent-900/20 border-2 border-accent-300 dark:border-accent-700 rounded-lg p-4">
        <p className="text-accent-800 dark:text-accent-300 font-semibold mb-2 flex items-center gap-2">
          <AlertCircle size={18} aria-hidden="true" /> Awaiting Second
        </p>
        <p className="text-secondary-800 dark:text-secondary-200">"{pendingSecond.text}"</p>
        <p className="text-sm text-secondary-600 dark:text-secondary-400 mt-1">
          {pendingSecond.name} by {pendingSecond.mover}
        </p>
      </div>
      {pendingSecond.moverId === currentUser.id ? (
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4 text-center">
          <p className="text-primary-800 dark:text-primary-300 font-medium mb-1">
            You moved this motion
          </p>
          <p className="text-primary-600 dark:text-primary-400 text-sm">
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
          className="w-full min-h-[56px] bg-accent-500 text-white py-4 rounded-xl hover:bg-accent-600 font-semibold text-lg touch-manipulation active:scale-[0.98] transition-transform focus:outline-hidden focus:ring-2 focus:ring-accent-400 focus:ring-offset-2"
        >
          I Second This Motion
        </button>
      )}
    </div>
  );
});
