import React, { useState } from 'react';
import { Hand } from 'lucide-react';
import type {
  MeetingState,
  MeetingAction,
  Member,
  SpeakerQueueEntry,
} from '@robbie-bylawyer/shared/types';

interface SpeakerRecognitionPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  currentUser: Member;
  handRaised: SpeakerQueueEntry | undefined;
}

export const SpeakerRecognitionPanel = React.memo(function SpeakerRecognitionPanel({
  state,
  dispatch,
  currentUser,
  handRaised,
}: SpeakerRecognitionPanelProps) {
  const [selectedStance, setSelectedStance] = useState<'pro' | 'con' | 'neutral'>('neutral');

  // Calculate queue position for user feedback
  const queuePosition = handRaised
    ? state.speakerQueue.findIndex((s) => s.member.id === currentUser.id) + 1
    : 0;

  if (handRaised) {
    return (
      <section className="bg-white rounded-xl p-4 shadow" aria-labelledby="speaker-heading">
        <h3
          id="speaker-heading"
          className="font-semibold mb-3 flex items-center gap-2 text-gray-800"
        >
          <Hand size={18} aria-hidden="true" /> Seek Recognition
        </h3>
        <div className="space-y-3">
          <div
            className="bg-amber-100 border-2 border-amber-300 rounded-xl p-4 text-center"
            role="status"
          >
            <div className="text-3xl mb-2" aria-hidden="true">
              ✋
            </div>
            <p className="font-semibold text-amber-800 text-lg">Hand Raised</p>
            {queuePosition > 0 && (
              <p className="text-sm text-amber-700 mt-1">
                Position in queue: <span className="font-bold">{queuePosition}</span> of{' '}
                {state.speakerQueue.length}
              </p>
            )}
            <p className="text-sm text-amber-600 mt-2">
              Stance:{' '}
              {handRaised.stance === 'pro'
                ? '✓ For'
                : handRaised.stance === 'con'
                  ? '✗ Against'
                  : '○ Neutral'}
            </p>
          </div>
          <button
            onClick={() => dispatch({ type: 'LOWER_HAND', member: currentUser })}
            className="w-full min-h-[48px] py-3 bg-gray-500 text-white rounded-xl font-medium hover:bg-gray-600 touch-manipulation active:scale-[0.98] transition-transform focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            Lower Hand
          </button>
        </div>
      </section>
    );
  }

  const stanceButtonClass = `
    min-h-[48px] py-3 px-4 rounded-xl text-sm font-semibold
    transition-all duration-150 ease-out
    touch-manipulation active:scale-[0.97]
    focus:outline-none focus:ring-2 focus:ring-offset-2
  `
    .trim()
    .replace(/\s+/g, ' ');

  return (
    <section className="bg-white rounded-xl p-4 shadow" aria-labelledby="speaker-heading">
      <h3 id="speaker-heading" className="font-semibold mb-3 flex items-center gap-2 text-gray-800">
        <Hand size={18} aria-hidden="true" /> Seek Recognition
      </h3>
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-800 mb-3 font-medium">
            Select your position on the motion:
          </p>
          <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Debate position">
            <button
              onClick={() => setSelectedStance('pro')}
              className={`${stanceButtonClass} focus:ring-green-500 ${
                selectedStance === 'pro'
                  ? 'bg-green-600 text-white ring-2 ring-green-300'
                  : 'bg-white text-green-700 border-2 border-green-300 hover:bg-green-50'
              }`}
              role="radio"
              aria-checked={selectedStance === 'pro'}
            >
              ✓ For
            </button>
            <button
              onClick={() => setSelectedStance('con')}
              className={`${stanceButtonClass} focus:ring-red-500 ${
                selectedStance === 'con'
                  ? 'bg-red-600 text-white ring-2 ring-red-300'
                  : 'bg-white text-red-700 border-2 border-red-300 hover:bg-red-50'
              }`}
              role="radio"
              aria-checked={selectedStance === 'con'}
            >
              ✗ Against
            </button>
            <button
              onClick={() => setSelectedStance('neutral')}
              className={`${stanceButtonClass} focus:ring-gray-500 ${
                selectedStance === 'neutral'
                  ? 'bg-gray-600 text-white ring-2 ring-gray-400'
                  : 'bg-white text-gray-700 border-2 border-gray-300 hover:bg-gray-50'
              }`}
              role="radio"
              aria-checked={selectedStance === 'neutral'}
            >
              ○ Neutral
            </button>
          </div>
        </div>
        <button
          onClick={() =>
            dispatch({ type: 'RAISE_HAND', member: currentUser, stance: selectedStance })
          }
          className="w-full min-h-[56px] py-4 bg-blue-500 text-white rounded-xl font-semibold text-lg hover:bg-blue-600 touch-manipulation active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
        >
          ✋ Raise Hand to Speak
        </button>
        <p className="text-xs text-gray-500 text-center">
          Per Robert's Rules, speakers alternate between for and against
        </p>
      </div>
    </section>
  );
});
