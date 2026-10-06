import React, { useState, useCallback, useMemo } from 'react';
import { Gavel, UserCheck } from 'lucide-react';
import { generateMeetingCode, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';

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
        className="font-semibold mb-3 flex items-center gap-2 text-secondary-800 dark:text-white"
      >
        <Gavel size={18} aria-hidden="true" /> Meeting Control
      </h3>

      {!state.meetingActive ? (
        <button
          onClick={() =>
            dispatch({
              type: 'START_MEETING',
              meetingCode: generateMeetingCode(),
              timestamp: generateTimestamp(),
            })
          }
          className="w-full bg-success-500 text-white py-3 rounded-lg hover:bg-success-600 font-medium"
        >
          Call Meeting to Order
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-success-50 dark:bg-success-900/20 rounded-lg">
            <span className="text-success-700 dark:text-success-300 font-medium">
              Meeting in Progress
            </span>
            <span className="text-success-600 dark:text-success-400 font-mono">
              {state.meetingCode}
            </span>
          </div>
          <button
            onClick={() => dispatch({ type: 'END_MEETING', timestamp: generateTimestamp() })}
            className="w-full bg-danger-500 text-white py-2 rounded-lg hover:bg-danger-600"
          >
            Adjourn
          </button>

          {/* Chair Transfer */}
          {transferableMembers.length > 0 && (
            <div className="border-t border-secondary-200 dark:border-secondary-700 pt-3 mt-3">
              <h4 className="text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2 flex items-center gap-2">
                <UserCheck size={16} aria-hidden="true" />
                Transfer Chair Role
              </h4>
              <div className="space-y-2">
                {transferableMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-2 bg-secondary-50 dark:bg-secondary-800 rounded-lg"
                  >
                    <span className="text-sm text-secondary-900 dark:text-white">
                      {member.name}
                    </span>
                    {showTransferConfirm === member.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleTransferChair(member.id)}
                          className="bg-meeting-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-meeting-700"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setShowTransferConfirm(null)}
                          className="bg-secondary-300 dark:bg-secondary-600 text-secondary-700 dark:text-secondary-300 px-3 py-1 rounded text-xs font-medium hover:bg-secondary-400 dark:hover:bg-secondary-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowTransferConfirm(member.id)}
                        className="text-meeting-600 dark:text-meeting-400 hover:text-meeting-800 dark:hover:text-meeting-300 text-sm font-medium"
                      >
                        Transfer
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-2">
                You will become a regular member after transferring.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
});
