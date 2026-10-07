import { FileText } from 'lucide-react';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import {
  agendaNamesTheApproval,
  minutesHeading,
  minutesItemUnderWay,
} from '../../utils/minutesApproval';

/**
 * On a phone, while the previous minutes are the business: which minutes, the question, and for
 * a member the published minutes to read. A guest is sent their id without their text, and minutes
 * typed in have no published copy: neither gets the link.
 */
export function MinutesNotice({ state }: { state: MeetingState }) {
  if (!minutesItemUnderWay(state)) return null;
  const made = state.minutesApproval?.corrections;
  const readable = !!state.minutesFromPreviousMeeting && !!state.previousMinutesId;
  return (
    <section aria-label="Approval of the minutes" className="card space-y-1 p-4">
      {/* The header's agenda line may say it already */}
      {!agendaNamesTheApproval(state) && <p className="label-caps">Approval of the minutes</p>}
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
      {readable && (
        // A tab of its own: the phone stays in the meeting
        <a
          href={`/minutes/${state.previousMinutesId}`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 pt-1 text-sm text-gavel hover:underline"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          Read the minutes
        </a>
      )}
    </section>
  );
}
