import { floorOpenForDebate } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import type { MeetingDispatch } from '../../types/socket';

interface ForumHandProps {
  state: MeetingState;
  dispatch: MeetingDispatch;
  me: Member;
}

/**
 * Asking for the floor with nothing pending: an open forum, questions on a report. The chair
 * recognizes people in the order they asked; the queue ends with the agenda item, or when a
 * question is stated.
 */
export function ForumHand({ state, dispatch, me }: ForumHandProps) {
  if (state.currentMotion || !floorOpenForDebate(state)) return null;
  if (state.recognizedSpeaker?.id === me.id) return null;
  const place = state.speakerQueue.findIndex((entry) => entry.member.id === me.id) + 1;
  return place > 0 ? (
    <div className="space-y-2">
      <p role="status" className="text-ink">
        You asked to speak: {place} of {state.speakerQueue.length} waiting.
      </p>
      <button
        type="button"
        className="btn-secondary btn-lg w-full"
        onClick={() => dispatch({ type: 'LOWER_HAND', member: me })}
      >
        Withdraw the request
      </button>
    </div>
  ) : (
    <button
      type="button"
      className="btn-secondary btn-lg w-full"
      onClick={() => dispatch({ type: 'RAISE_HAND', member: me, stance: 'neutral' })}
    >
      Ask to speak
    </button>
  );
}
