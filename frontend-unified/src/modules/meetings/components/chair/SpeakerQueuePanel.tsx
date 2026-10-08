import React, { useState, useCallback, useEffect } from 'react';
import { generateTimestamp, calculateTimerEnd } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction, SpeakerQueueEntry } from '@robbie-bylawyer/shared/types';
import { Check, Circle, X } from 'lucide-react';
import { CountdownTimer } from '../CountdownTimer';

interface SpeakerQueuePanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  sortedQueue: SpeakerQueueEntry[];
}

// Memoized list item to avoid recreating click handlers on every render
interface SpeakerListItemProps {
  entry: SpeakerQueueEntry;
  index: number;
  isMotionMaker: boolean;
  speakerTimeLimit: number;
  dispatch: React.Dispatch<MeetingAction>;
}

const SpeakerListItem = React.memo(function SpeakerListItem({
  entry,
  index,
  isMotionMaker,
  speakerTimeLimit,
  dispatch,
}: SpeakerListItemProps) {
  const StanceIcon = entry.stance === 'pro' ? Check : entry.stance === 'con' ? X : Circle;
  const stanceColor =
    entry.stance === 'pro'
      ? 'text-carried'
      : entry.stance === 'con'
        ? 'text-gavel'
        : 'text-ink-muted';
  const stanceLabel =
    entry.stance === 'pro' ? 'For' : entry.stance === 'con' ? 'Against' : 'Neutral';

  const handleRecognize = useCallback(() => {
    dispatch({
      type: 'RECOGNIZE_SPEAKER',
      member: entry.member,
      stance: entry.stance,
      speakerTimerEnd: calculateTimerEnd(speakerTimeLimit),
      timestamp: generateTimestamp(),
    });
  }, [dispatch, entry.member, entry.stance, speakerTimeLimit]);

  return (
    <li
      className={`flex items-center justify-between p-3 rounded-lg ${
        isMotionMaker ? 'bg-gavel-tint border-2 border-gavel/30' : 'bg-surface-2'
      }`}
    >
      <span className="flex items-center gap-2 text-ink">
        <span>
          {index + 1}. {entry.member.name}
        </span>
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${stanceColor}`}>
          <StanceIcon className="h-4 w-4" aria-hidden="true" /> {stanceLabel}
        </span>
        {isMotionMaker && (
          <span className="ml-2 text-xs text-ink-muted font-medium">Moved it: speaks first</span>
        )}
      </span>
      <button
        onClick={handleRecognize}
        className="px-4 py-1 rounded text-sm text-paper bg-gavel hover:bg-gavel-700 dark:hover:bg-gavel-300"
        aria-label={`Recognize ${entry.member.name} to speak`}
      >
        Recognize
      </button>
    </li>
  );
});

export const SpeakerQueuePanel = React.memo(function SpeakerQueuePanel({
  state,
  dispatch,
  sortedQueue,
}: SpeakerQueuePanelProps) {
  const [speakerTimeExpired, setSpeakerTimeExpired] = useState(false);

  // Reset speaker time expired state when speaker changes
  const recognizedSpeakerId = state.recognizedSpeaker?.id;
  useEffect(() => {
    setSpeakerTimeExpired(false);
  }, [recognizedSpeakerId]);

  // Callback when speaker time expires
  const handleSpeakerTimeExpired = useCallback(() => {
    setSpeakerTimeExpired(true);
    // Auto-yield if enabled
    if (state.autoYieldOnTimeExpired && state.recognizedSpeaker) {
      dispatch({ type: 'YIELD_FLOOR', timestamp: generateTimestamp() });
    }
  }, [state.autoYieldOnTimeExpired, state.recognizedSpeaker, dispatch]);

  return (
    <section className="card p-4" aria-labelledby="speaker-queue-heading">
      <div className="flex items-center justify-between mb-3">
        <h3 id="speaker-queue-heading" className="label-caps flex items-center gap-2">
          Speaker queue
          <span className="rounded-full bg-surface-2 px-2 py-0.5 tabular-nums text-ink">
            {state.speakerQueue.length}
          </span>
        </h3>
        <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
          <input
            type="checkbox"
            checked={state.autoYieldOnTimeExpired}
            onChange={(e) => dispatch({ type: 'SET_AUTO_YIELD', enabled: e.target.checked })}
            className="rounded-sm border-rule accent-gavel focus:ring-gavel"
          />
          Auto-yield on timeout
        </label>
      </div>

      {state.recognizedSpeaker && (
        <div className="mb-3 p-3 bg-carried-tint rounded-lg" role="status">
          <div className="text-ink font-medium mb-2">
            <strong>{state.recognizedSpeaker.name}</strong> has the floor
          </div>
          {state.speakerTimerEnd && (
            <CountdownTimer
              endTime={state.speakerTimerEnd}
              label="Speaking Time"
              onExpired={handleSpeakerTimeExpired}
            />
          )}
          {speakerTimeExpired && (
            <div
              className="mt-2 p-3 bg-caution-tint border-2 border-caution rounded-lg animate-pulse"
              role="alert"
            >
              <p className="text-ink font-semibold">Speaking time has expired</p>
              <p className="text-caution-ink text-sm">
                Consider asking the speaker to yield the floor or extend their time.
              </p>
            </div>
          )}
        </div>
      )}

      {state.speakerQueue.length === 0 ? (
        <p className="text-ink-muted text-center py-4">No one waiting</p>
      ) : (
        <ul className="space-y-2" role="list" aria-label="Speakers waiting to speak">
          {sortedQueue.map((entry, i) => {
            const motionMakerId = state.currentMotion?.moverId;
            const moverHasSpoken = state.currentMotion?.moverHasSpoken;
            const isMotionMaker = motionMakerId === entry.member.id && !moverHasSpoken;

            return (
              <SpeakerListItem
                key={entry.member.id}
                entry={entry}
                index={i}
                isMotionMaker={isMotionMaker}
                speakerTimeLimit={state.speakerTimeLimit}
                dispatch={dispatch}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
});
