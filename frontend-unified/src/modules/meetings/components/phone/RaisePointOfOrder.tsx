import { useId, useState, type FormEvent } from 'react';
import { MAX_MOTION_TEXT_LENGTH } from '@robbie-bylawyer/shared/constants';
import { generateId, generateTimestamp, motionOutOfOrder } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import type { MeetingDispatch } from '../../types/socket';

interface RaisePointOfOrderProps {
  state: MeetingState;
  dispatch: MeetingDispatch;
  me: Member;
}

/**
 * A point of order from a phone at the moments nothing else can be moved: during a vote, while a
 * motion awaits a second, while the chair asks for unanimous consent (RONR 23:5). Folded away
 * until it is needed; the chair rules on it at once.
 */
export function RaisePointOfOrder({ state, dispatch, me }: RaisePointOfOrderProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  if (me.role === 'guest' || motionOutOfOrder(state, 'pointOrder')) return null;

  const raise = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    const raised = await dispatch({
      type: 'MAKE_MOTION',
      motionType: 'pointOrder',
      text: text.trim(),
      mover: me.name,
      moverId: me.id,
      motionId: generateId(),
      timestamp: generateTimestamp(),
    });
    setSending(false);
    if (raised) setText('');
  };

  return (
    <details className="rounded-lg border border-rule">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink">
        Point of order
      </summary>
      <form onSubmit={raise} className="space-y-2 border-t border-rule p-4">
        <label htmlFor={id} className="label">
          What is out of order
        </label>
        <textarea
          id={id}
          className="textarea"
          rows={2}
          maxLength={MAX_MOTION_TEXT_LENGTH}
          placeholder="The rule that is not being followed"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn-secondary w-full" disabled={!text.trim() || sending}>
          Raise the point of order
        </button>
      </form>
    </details>
  );
}
