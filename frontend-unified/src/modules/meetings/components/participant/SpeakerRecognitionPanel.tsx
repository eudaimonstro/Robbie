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
      <section className="bg-surface rounded-xl p-4 shadow-sm" aria-labelledby="speaker-heading">
        <h3 id="speaker-heading" className="font-semibold mb-3 flex items-center gap-2 text-ink">
          <Hand size={18} aria-hidden="true" /> Seek Recognition
        </h3>
        <div className="space-y-3">
          <div
            className="bg-caution-tint border-2 border-caution/40 rounded-xl p-4 text-center"
            role="status"
          >
            <Hand size={32} className="mx-auto mb-2 text-caution-ink" aria-hidden="true" />
            <p className="font-semibold text-ink text-lg">Hand Raised</p>
            {queuePosition > 0 && (
              <p className="text-sm text-caution-ink mt-1">
                Position in queue: <span className="font-bold">{queuePosition}</span> of{' '}
                {state.speakerQueue.length}
              </p>
            )}
            <p className="text-sm text-caution-ink mt-2">
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
            className="w-full min-h-[48px] py-3 bg-ink-muted text-paper rounded-xl font-medium hover:bg-ink touch-manipulation active:scale-[0.98] transition-transform focus:outline-hidden focus:ring-2 focus:ring-ink-muted focus:ring-offset-2"
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
    focus:outline-hidden focus:ring-2 focus:ring-offset-2
  `
    .trim()
    .replace(/\s+/g, ' ');

  return (
    <section className="bg-surface rounded-xl p-4 shadow-sm" aria-labelledby="speaker-heading">
      <h3 id="speaker-heading" className="font-semibold mb-3 flex items-center gap-2 text-ink">
        <Hand size={18} aria-hidden="true" /> Seek Recognition
      </h3>
      <div className="space-y-4">
        <div className="bg-gavel-tint border border-rule rounded-xl p-4">
          <p className="text-sm text-ink mb-3 font-medium">Select your position on the motion:</p>
          <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Debate position">
            <button
              onClick={() => setSelectedStance('pro')}
              className={`${stanceButtonClass} focus:ring-gavel ${
                selectedStance === 'pro'
                  ? 'bg-carried text-paper ring-2 ring-carried/40'
                  : 'bg-surface text-carried border-2 border-carried/40 hover:bg-carried-tint'
              }`}
              role="radio"
              aria-checked={selectedStance === 'pro'}
            >
              ✓ For
            </button>
            <button
              onClick={() => setSelectedStance('con')}
              className={`${stanceButtonClass} focus:ring-gavel ${
                selectedStance === 'con'
                  ? 'bg-gavel text-paper ring-2 ring-gavel/30'
                  : 'bg-surface text-gavel border-2 border-gavel/30 hover:bg-gavel-tint'
              }`}
              role="radio"
              aria-checked={selectedStance === 'con'}
            >
              ✗ Against
            </button>
            <button
              onClick={() => setSelectedStance('neutral')}
              className={`${stanceButtonClass} focus:ring-gavel ${
                selectedStance === 'neutral'
                  ? 'bg-ink text-paper ring-2 ring-ink-muted'
                  : 'bg-surface text-ink border-2 border-rule hover:bg-surface-2'
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
          className="w-full min-h-[56px] py-4 bg-gavel text-paper rounded-xl font-semibold text-lg hover:bg-gavel/90 touch-manipulation active:scale-[0.98] transition-all focus:outline-hidden focus:ring-2 focus:ring-gavel focus:ring-offset-2"
        >
          Raise Hand to Speak
        </button>
        <p className="text-xs text-ink-muted text-center">
          Per Robert's Rules, speakers alternate between for and against
        </p>
      </div>
    </section>
  );
});
