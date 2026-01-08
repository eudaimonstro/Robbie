import React, { useState, useCallback, useEffect } from 'react';
import { Hand } from 'lucide-react';
import { generateTimestamp, calculateTimerEnd } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction, SpeakerQueueEntry } from '@robbie-bylawyer/shared/types';
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
  dispatch
}: SpeakerListItemProps) {
  const stanceIcon = entry.stance === 'pro' ? '✓' : entry.stance === 'con' ? '✗' : '○';
  const stanceColor = entry.stance === 'pro' ? 'text-green-600' : entry.stance === 'con' ? 'text-red-600' : 'text-gray-500';
  const stanceLabel = entry.stance === 'pro' ? 'For' : entry.stance === 'con' ? 'Against' : 'Neutral';

  const handleRecognize = useCallback(() => {
    dispatch({
      type: 'RECOGNIZE_SPEAKER',
      member: entry.member,
      stance: entry.stance,
      speakerTimerEnd: calculateTimerEnd(speakerTimeLimit),
      timestamp: generateTimestamp()
    });
  }, [dispatch, entry.member, entry.stance, speakerTimeLimit]);

  return (
    <li
      className={`flex items-center justify-between p-3 rounded-lg ${
        isMotionMaker ? 'bg-indigo-50 border-2 border-indigo-300' : 'bg-gray-50'
      }`}
    >
      <span className="flex items-center gap-2">
        <span>{index + 1}. {entry.member.name}</span>
        <span className={`text-xs font-medium ${stanceColor}`} title={stanceLabel}>
          {stanceIcon} {stanceLabel}
        </span>
        {isMotionMaker && (
          <span className="ml-2 text-xs text-indigo-600 font-medium">
            (Motion Maker - speaks first)
          </span>
        )}
      </span>
      <button
        onClick={handleRecognize}
        className={`px-4 py-1 rounded text-sm text-white ${
          isMotionMaker ? 'bg-indigo-600' : 'bg-blue-500'
        }`}
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
  sortedQueue
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
    <section className="bg-white rounded-lg p-4 shadow" aria-labelledby="speaker-queue-heading">
      <div className="flex items-center justify-between mb-3">
        <h3 id="speaker-queue-heading" className="font-semibold flex items-center gap-2 text-gray-800">
          <Hand size={18} aria-hidden="true" /> Speaker Queue{' '}
          <span className="bg-gray-200 text-gray-700 text-sm px-2 py-0.5 rounded-full">
            {state.speakerQueue.length}
          </span>
        </h3>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={state.autoYieldOnTimeExpired}
            onChange={(e) => dispatch({ type: 'SET_AUTO_YIELD', enabled: e.target.checked })}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Auto-yield on timeout
        </label>
      </div>

      {state.recognizedSpeaker && (
        <div className="mb-3 p-3 bg-green-100 rounded-lg" role="status">
          <div className="text-green-800 font-medium mb-2">
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
            <div className="mt-2 p-3 bg-amber-100 border-2 border-amber-400 rounded-lg animate-pulse" role="alert">
              <p className="text-amber-800 font-semibold">
                <span aria-hidden="true">⏰</span> Speaking time has expired
              </p>
              <p className="text-amber-700 text-sm">
                Consider asking the speaker to yield the floor or extend their time.
              </p>
            </div>
          )}
        </div>
      )}

      {state.speakerQueue.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No one waiting</p>
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
