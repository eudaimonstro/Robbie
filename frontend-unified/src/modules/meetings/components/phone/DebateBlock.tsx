import { useState } from 'react';
import type { DebateStance, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { STANCE_LABELS } from '../../utils/phoneMoment';
import { MotionPanel } from './MotionPanel';
import { useSortedSpeakerQueue } from '../../hooks/useSortedSpeakerQueue';
import type { MeetingDispatch } from '../../types/socket';

interface DebateBlockProps {
  state: MeetingState;
  dispatch: MeetingDispatch;
  me: Member;
}

const STANCES: DebateStance[] = ['pro', 'con', 'neutral'];

/** Debate on a phone: ask to speak with a position, or withdraw; other motions are folded away */
export function DebateBlock({ state, dispatch, me }: DebateBlockProps) {
  const [stance, setStance] = useState<DebateStance>('neutral');
  // The place in the order the chair will call speakers, as the console and the display show it
  const queue = useSortedSpeakerQueue(
    state.speakerQueue,
    state.currentMotion,
    state.lastSpeakerStance,
    state,
  );
  const place = queue.findIndex((entry) => entry.member.id === me.id) + 1;
  const queued = place > 0 ? queue[place - 1] : null;

  return (
    <div className="space-y-4">
      {queued ? (
        <>
          <p role="status" className="text-ink">
            You asked to speak: {place} of {queue.length} waiting,{' '}
            {STANCE_LABELS[queued.stance].toLowerCase()}.
          </p>
          <button
            type="button"
            className="btn-secondary btn-lg w-full"
            onClick={() => dispatch({ type: 'LOWER_HAND', member: me })}
          >
            Withdraw the request
          </button>
        </>
      ) : (
        <>
          <div>
            <p className="label-caps mb-2">Your position</p>
            <div role="group" aria-label="Your position" className="grid grid-cols-3 gap-2">
              {STANCES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={stance === option}
                  className={stance === option ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setStance(option)}
                >
                  {STANCE_LABELS[option]}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="btn-primary btn-lg w-full"
            onClick={() => dispatch({ type: 'RAISE_HAND', member: me, stance })}
          >
            Ask to speak
          </button>
        </>
      )}
      <details className="rounded-lg border border-rule">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink">
          Other motions
        </summary>
        <div className="border-t border-rule p-4">
          <MotionPanel state={state} dispatch={dispatch} me={me} othersOnly />
        </div>
      </details>
    </div>
  );
}
