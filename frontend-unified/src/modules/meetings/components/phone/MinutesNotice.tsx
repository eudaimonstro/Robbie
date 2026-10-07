import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { minutesHeading, minutesItemUnderWay } from '../../utils/minutesApproval';

/** On a phone, while the previous minutes are the business: which minutes, and the question */
export function MinutesNotice({ state }: { state: MeetingState }) {
  if (!minutesItemUnderWay(state)) return null;
  const made = state.minutesApproval?.corrections;
  return (
    <section aria-label="Approval of the minutes" className="card space-y-1 p-4">
      <p className="label-caps">Approval of the minutes</p>
      <p className="font-serif-soft text-lg font-semibold text-ink">
        {minutesHeading(state.minutesFromPreviousMeeting)}
      </p>
      {state.minutesApproved ? (
        <p className="text-sm text-carried">
          {made ? `Approved with corrections: ${made}` : 'Approved as read'}
        </p>
      ) : (
        <p className="text-ink">Any corrections?</p>
      )}
    </section>
  );
}
