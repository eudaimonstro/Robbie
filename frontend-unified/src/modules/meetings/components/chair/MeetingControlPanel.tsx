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
  dispatch
}: MeetingControlPanelProps) {
  const [showTransferConfirm, setShowTransferConfirm] = useState<number | null>(null);

  const transferableMembers = useMemo(
    () => state.members.filter(m => m.role !== 'chair'),
    [state.members]
  );

  const handleTransferChair = useCallback((targetMemberId: number) => {
    dispatch({
      type: 'SET_MEMBER_ROLE',
      targetMemberId,
      newRole: 'chair',
      timestamp: generateTimestamp()
    });
    setShowTransferConfirm(null);
  }, [dispatch]);

  return (
    <section className="bg-white rounded-lg p-4 shadow" aria-labelledby="meeting-control-heading">
      <h3 id="meeting-control-heading" className="font-semibold mb-3 flex items-center gap-2 text-gray-800">
        <Gavel size={18} aria-hidden="true" /> Meeting Control
      </h3>

      {!state.meetingActive ? (
        <button
          onClick={() => dispatch({
            type: 'START_MEETING',
            meetingCode: generateMeetingCode(),
            timestamp: generateTimestamp()
          })}
          className="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 font-medium"
        >
          Call Meeting to Order
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
            <span className="text-green-700 font-medium">Meeting in Progress</span>
            <span className="text-green-600 font-mono">{state.meetingCode}</span>
          </div>
          <button
            onClick={() => dispatch({ type: 'END_MEETING', timestamp: generateTimestamp() })}
            className="w-full bg-red-500 text-white py-2 rounded-lg hover:bg-red-600"
          >
            Adjourn
          </button>

          {/* Chair Transfer */}
          {transferableMembers.length > 0 && (
            <div className="border-t pt-3 mt-3">
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <UserCheck size={16} aria-hidden="true" />
                Transfer Chair Role
              </h4>
              <div className="space-y-2">
                {transferableMembers.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <span className="text-sm">{member.name}</span>
                    {showTransferConfirm === member.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleTransferChair(member.id)}
                          className="bg-purple-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-purple-700"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setShowTransferConfirm(null)}
                          className="bg-gray-300 text-gray-700 px-3 py-1 rounded text-xs font-medium hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowTransferConfirm(member.id)}
                        className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                      >
                        Transfer
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                You will become a regular member after transferring.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
});
