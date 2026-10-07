import React, { useState, useCallback, useMemo } from 'react';
import { Gavel, UserCheck } from 'lucide-react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction } from '@robbie-bylawyer/shared/types';

interface MeetingControlPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}

export const MeetingControlPanel = React.memo(function MeetingControlPanel({
  state,
  dispatch,
}: MeetingControlPanelProps) {
  const [showTransferConfirm, setShowTransferConfirm] = useState<number | null>(null);

  const transferableMembers = useMemo(
    () => state.members.filter((m) => m.role !== 'chair'),
    [state.members],
  );

  const handleTransferChair = useCallback(
    (targetMemberId: number) => {
      dispatch({
        type: 'SET_MEMBER_ROLE',
        targetMemberId,
        newRole: 'chair',
        timestamp: generateTimestamp(),
      });
      setShowTransferConfirm(null);
    },
    [dispatch],
  );

  return (
    <section className="card p-4" aria-labelledby="meeting-control-heading">
      <h3
        id="meeting-control-heading"
        className="font-semibold mb-3 flex items-center gap-2 text-ink"
      >
        <Gavel size={18} aria-hidden="true" /> Meeting Control
      </h3>

      {!state.meetingActive ? (
        <button
          onClick={() =>
            dispatch({
              type: 'START_MEETING',
              timestamp: generateTimestamp(),
            })
          }
          className="w-full bg-carried text-paper py-3 rounded-lg hover:bg-carried/90 font-medium"
        >
          Call Meeting to Order
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-carried-tint rounded-lg">
            <span className="text-carried font-medium">Meeting in Progress</span>
            <span className="text-carried font-mono">{state.meetingCode}</span>
          </div>
          <button
            onClick={() => dispatch({ type: 'END_MEETING', timestamp: generateTimestamp() })}
            className="w-full bg-gavel text-paper py-2 rounded-lg hover:bg-gavel/90"
          >
            Adjourn
          </button>

          {/* Chair Transfer */}
          {transferableMembers.length > 0 && (
            <div className="border-t border-rule pt-3 mt-3">
              <h4 className="text-sm font-medium text-ink mb-2 flex items-center gap-2">
                <UserCheck size={16} aria-hidden="true" />
                Transfer Chair Role
              </h4>
              <div className="space-y-2">
                {transferableMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-2 bg-surface-2 rounded-lg"
                  >
                    <span className="text-sm text-ink">{member.name}</span>
                    {showTransferConfirm === member.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleTransferChair(member.id)}
                          className="bg-gavel text-paper px-3 py-1 rounded-sm text-xs font-medium hover:bg-gavel/90"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setShowTransferConfirm(null)}
                          className="bg-rule text-ink px-3 py-1 rounded-sm text-xs font-medium hover:bg-ink-muted/25"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowTransferConfirm(member.id)}
                        className="text-gavel hover:underline text-sm font-medium"
                      >
                        Transfer
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-muted mt-2">
                You will become a regular member after transferring.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
});
