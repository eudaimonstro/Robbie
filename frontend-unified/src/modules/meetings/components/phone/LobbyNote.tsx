import { CheckCircle2 } from 'lucide-react';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { formatMeetingTime } from '../../../../utils/dates';

/** When the meeting is called for: the time today, or the day and time another day */
function startsAt(iso: string | null, now = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : formatMeetingTime(iso);
}

/**
 * The phone before the call to order, in one card: that its owner is checked in (a member
 * counted present), that the meeting hasn't been called to order, when it starts and who chairs
 */
export function LobbyNote({ state, me }: { state: MeetingState; me: Member }) {
  const chair = state.members.find((m) => m.role === 'chair');
  const when = startsAt(state.scheduledFor);
  const guest = me.role === 'guest';
  return (
    <div className="space-y-2">
      {me.present && (
        <p className="flex items-center gap-2 font-semibold text-carried">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
          {guest ? "You're here as a guest." : "You're checked in."}
        </p>
      )}
      <div className="space-y-1 text-ink-muted">
        <p>The meeting has not been called to order yet.</p>
        {(when || chair) && (
          <p>
            {when && `It starts at ${when}.`}
            {when && chair && ' '}
            {chair && `${chair.name} chairs it.`}
          </p>
        )}
      </div>
    </div>
  );
}
