import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { stanceLabel } from '../../utils/phoneMoment';
import { TimerLine } from '../TimerLine';
import { useSortedSpeakerQueue } from '../../hooks/useSortedSpeakerQueue';

/** Who has the floor and who is waiting, in the order the chair will call them */
export function SpeakerList({ state }: { state: MeetingState }) {
  const queue = useSortedSpeakerQueue(
    state.speakerQueue,
    state.currentMotion,
    state.lastSpeakerStance,
    state,
  );
  if (!state.recognizedSpeaker && queue.length === 0) return null;
  return (
    <section className="card space-y-3 p-4" aria-labelledby="speakers-heading">
      <h3 id="speakers-heading" className="label-caps">
        Speakers
      </h3>
      {state.recognizedSpeaker && (
        <div className="space-y-1">
          <p className="text-sm text-ink">
            <span className="font-medium">{state.recognizedSpeaker.name}</span> has the floor
          </p>
          <TimerLine
            endTime={state.speakerTimerEnd}
            totalSeconds={state.speakerTimeLimit}
            label="Speaking time"
          />
        </div>
      )}
      {queue.length > 0 && (
        <ol className="space-y-1 text-sm text-ink">
          {queue.map((entry, index) => (
            <li key={entry.member.id}>
              {index + 1}. {entry.member.name}{' '}
              <span className="text-ink-muted">({stanceLabel(entry.stance)})</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** The agenda, read only, with the current item marked */
export function PhoneAgenda({ state }: { state: MeetingState }) {
  if (state.agenda.length === 0) return null;
  return (
    <section className="card space-y-2 p-4" aria-labelledby="phone-agenda-heading">
      <h3 id="phone-agenda-heading" className="label-caps">
        Agenda
      </h3>
      <ol className="space-y-1">
        {state.agenda.map((item, index) => (
          <li
            key={item.id}
            className={`text-sm ${
              item.status === 'completed'
                ? 'text-ink-muted line-through'
                : item.status === 'active'
                  ? 'border-l-2 border-gavel pl-2 font-medium text-ink'
                  : 'text-ink'
            }`}
          >
            {item.status === 'active' && <span className="sr-only">Current item: </span>}
            {index + 1}. {item.title}
          </li>
        ))}
      </ol>
    </section>
  );
}
