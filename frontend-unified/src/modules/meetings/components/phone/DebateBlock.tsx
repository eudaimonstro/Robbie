import { useState } from 'react';
import type {
  DebateStance,
  MeetingAction,
  MeetingState,
  Member,
} from '@robbie-bylawyer/shared/types';
import { STANCE_LABELS } from '../../utils/phoneMoment';
import { MotionPanel } from './MotionPanel';

interface DebateBlockProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  me: Member;
}

const STANCES: DebateStance[] = ['pro', 'con', 'neutral'];

/** Debate on a phone: raise a hand with a position, or lower it; other motions are folded away */
export function DebateBlock({ state, dispatch, me }: DebateBlockProps) {
  const [stance, setStance] = useState<DebateStance>('neutral');
  const queued = state.speakerQueue.find((entry) => entry.member.id === me.id);
  const place = queued ? state.speakerQueue.indexOf(queued) + 1 : 0;

  return (
    <div className="space-y-4">
      {queued ? (
        <>
          <p role="status" className="text-ink">
            Hand raised: {place} of {state.speakerQueue.length} waiting,{' '}
            {STANCE_LABELS[queued.stance].toLowerCase()}.
          </p>
          <button
            type="button"
            className="btn-secondary btn-lg w-full"
            onClick={() => dispatch({ type: 'LOWER_HAND', member: me })}
          >
            Lower your hand
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
            Raise hand
          </button>
        </>
      )}
      <details className="rounded-lg border border-rule">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink">
          Other motions
        </summary>
        <div className="border-t border-rule p-4">
          <MotionPanel state={state} dispatch={dispatch} me={me} />
        </div>
      </details>
    </div>
  );
}
