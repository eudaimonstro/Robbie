import React from 'react';
import { Timer } from 'lucide-react';
import type { MeetingAction } from '@robbie-bylawyer/shared/types';

interface TimeLimitsPanelProps {
  speakerTime: number;
  setSpeakerTime: (time: number) => void;
  voteTime: number;
  setVoteTime: (time: number) => void;
  dispatch: React.Dispatch<MeetingAction>;
}

export const TimeLimitsPanel = React.memo(function TimeLimitsPanel({
  speakerTime,
  setSpeakerTime,
  voteTime,
  setVoteTime,
  dispatch
}: TimeLimitsPanelProps) {
  return (
    <div className="card p-4">
      <h3 className="font-semibold mb-3 flex items-center gap-2 text-secondary-800 dark:text-white">
        <Timer size={18}/> Time Limits
      </h3>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
            Speaker Time Limit (seconds)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              value={speakerTime}
              onChange={(e) => setSpeakerTime(parseInt(e.target.value) || 0)}
              className="flex-1 p-2 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white"
            />
            <button
              onClick={() => dispatch({ type: 'SET_SPEAKER_TIME_LIMIT', seconds: speakerTime })}
              className="bg-meeting-600 text-white px-4 rounded-lg text-sm hover:bg-meeting-700"
            >
              Set
            </button>
          </div>
          <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-1">Set to 0 to disable timer</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
            Vote Time Limit (seconds)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              value={voteTime}
              onChange={(e) => setVoteTime(parseInt(e.target.value) || 0)}
              className="flex-1 p-2 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white"
            />
            <button
              onClick={() => dispatch({ type: 'SET_VOTE_TIME_LIMIT', seconds: voteTime })}
              className="bg-meeting-600 text-white px-4 rounded-lg text-sm hover:bg-meeting-700"
            >
              Set
            </button>
          </div>
          <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-1">Set to 0 to disable timer</p>
        </div>
      </div>
    </div>
  );
});
