import { useState } from 'react';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import type { MeetingDispatch } from '../../types/socket';

interface WithdrawMineProps {
  state: MeetingState;
  dispatch: MeetingDispatch;
  me: Member;
}

/**
 * The mover's way to take back their motion: at once while it awaits a second, or once stated by
 * asking the meeting's permission, which the chair puts without objection or to a vote. Only for
 * the motion before the meeting, and not during a vote.
 */
export function WithdrawMine({ state, dispatch, me }: WithdrawMineProps) {
  const [asked, setAsked] = useState<number | null>(null);
  const motion = state.pendingSecond ?? state.currentMotion;
  if (
    !motion ||
    motion.moverId !== me.id ||
    motion.vote === 'none' ||
    motion.type === 'withdrawMotion' ||
    state.votingOpen
  ) {
    return null;
  }
  const stated = !state.pendingSecond;
  return (
    <div className="space-y-2 border-t border-rule pt-3">
      <button
        type="button"
        className="btn-secondary w-full"
        disabled={asked === motion.id}
        onClick={async () => {
          setAsked(motion.id);
          const sent = await dispatch({
            type: 'WITHDRAW_MOTION',
            requesterId: me.id,
            motionId: generateId(),
            timestamp: generateTimestamp(),
          });
          if (!sent) setAsked(null);
        }}
      >
        Withdraw my motion
      </button>
      {stated && (
        <p className="text-xs text-ink-muted">
          It has been stated, so the chair asks the meeting&apos;s permission.
        </p>
      )}
    </div>
  );
}
