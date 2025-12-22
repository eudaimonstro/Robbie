import React, { useState } from 'react';
import { Hand } from 'lucide-react';
import type { MeetingState, MeetingAction, Member, SpeakerQueueEntry } from '@robbie/shared/types';

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
  handRaised
}: SpeakerRecognitionPanelProps) {
  const [selectedStance, setSelectedStance] = useState<'pro' | 'con' | 'neutral'>('neutral');

  if (handRaised) {
    return (
      <section className="bg-white rounded-lg p-4 shadow" aria-labelledby="speaker-heading">
        <h3 id="speaker-heading" className="font-semibold mb-3 flex items-center gap-2 text-gray-800">
          <Hand size={18} aria-hidden="true" /> Seek Recognition
        </h3>
        <div className="space-y-2">
          <div className="bg-amber-100 border-2 border-amber-300 rounded-lg p-3 text-center" role="status">
            <p className="font-medium text-amber-700">✋ Hand Raised</p>
            <p className="text-xs text-amber-600 mt-1">
              Stance: {handRaised.stance === 'pro' ? '✓ For' : handRaised.stance === 'con' ? '✗ Against' : '○ Neutral'}
            </p>
          </div>
          <button
            onClick={() => dispatch({ type: 'LOWER_HAND', member: currentUser })}
            className="w-full py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
          >
            Lower Hand
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-lg p-4 shadow" aria-labelledby="speaker-heading">
      <h3 id="speaker-heading" className="font-semibold mb-3 flex items-center gap-2 text-gray-800">
        <Hand size={18} aria-hidden="true" /> Seek Recognition
      </h3>
      <div className="space-y-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-800 mb-2 font-medium">Select your position on the motion:</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Debate position">
            <button
              onClick={() => setSelectedStance('pro')}
              className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
                selectedStance === 'pro'
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-green-700 border border-green-300 hover:bg-green-50'
              }`}
              role="radio"
              aria-checked={selectedStance === 'pro'}
            >
              ✓ For
            </button>
            <button
              onClick={() => setSelectedStance('con')}
              className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
                selectedStance === 'con'
                  ? 'bg-red-600 text-white'
                  : 'bg-white text-red-700 border border-red-300 hover:bg-red-50'
              }`}
              role="radio"
              aria-checked={selectedStance === 'con'}
            >
              ✗ Against
            </button>
            <button
              onClick={() => setSelectedStance('neutral')}
              className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
                selectedStance === 'neutral'
                  ? 'bg-gray-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
              role="radio"
              aria-checked={selectedStance === 'neutral'}
            >
              ○ Neutral
            </button>
          </div>
        </div>
        <button
          onClick={() => dispatch({ type: 'RAISE_HAND', member: currentUser, stance: selectedStance })}
          className="w-full py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600"
        >
          Raise Hand to Speak
        </button>
        <p className="text-xs text-gray-500 text-center">
          Per Robert's Rules, speakers alternate between for and against
        </p>
      </div>
    </section>
  );
});
