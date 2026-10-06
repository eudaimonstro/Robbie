import React, { useMemo } from 'react';
import { generateTimestamp, calculateTimerEnd } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction, VotingMethod } from '@robbie-bylawyer/shared/types';
import { MotionCard } from '../MotionCard';

interface PendingMotionPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}

export const PendingMotionPanel = React.memo(function PendingMotionPanel({
  state,
  dispatch,
}: PendingMotionPanelProps) {
  // Memoize objection alert data
  const recentObjection = useMemo(() => {
    const lastLog = state.meetingLog[state.meetingLog.length - 1];
    if (lastLog && lastLog.message.includes('objects')) {
      return lastLog;
    }
    return null;
  }, [state.meetingLog]);

  if (
    !state.currentMotion ||
    state.votingOpen ||
    state.pendingSecond ||
    state.unanimousConsentPending
  ) {
    return null;
  }

  return (
    <section className="bg-white rounded-lg p-4 shadow" aria-labelledby="pending-motion-heading">
      <h3 id="pending-motion-heading" className="font-semibold mb-3 text-gray-800">
        Pending Motion
      </h3>

      {/* Show objection alert if recent log entry indicates objection */}
      {recentObjection && (
        <div className="mb-3 p-3 bg-amber-50 border-2 border-amber-300 rounded-lg" role="alert">
          <p className="text-amber-800 font-semibold mb-1">⚠️ Objection Raised</p>
          <p className="text-amber-700 text-sm">{recentObjection.message}</p>
          <p className="text-amber-600 text-xs mt-2">Motion requires debate and/or formal vote.</p>
        </div>
      )}

      <MotionCard motion={state.currentMotion} />

      {/* Special notice for Appeal */}
      {state.currentMotion.type === 'appeal' && state.lastChairRuling && (
        <div className="mt-3 p-4 bg-purple-50 border-2 border-purple-300 rounded-lg">
          <p className="text-purple-800 font-semibold mb-2">⚖️ Appeal of Chair's Ruling</p>
          <p className="text-purple-700 text-sm mb-1">
            <strong>Ruling being appealed:</strong> "{state.lastChairRuling.ruling}"
          </p>
          <p className="text-purple-600 text-xs">
            Vote YEA to sustain the chair's decision, NAY to overturn it. Majority sustains.
          </p>
        </div>
      )}

      {/* Motions with vote: 'none' don't require voting - chair makes a ruling */}
      {state.currentMotion.vote === 'none' ? (
        <ChairRulingControls state={state} dispatch={dispatch} />
      ) : (
        <VotingMethodControls state={state} dispatch={dispatch} />
      )}
    </section>
  );
});

// Sub-component for chair ruling controls
function ChairRulingControls({
  state,
  dispatch,
}: {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}) {
  if (!state.currentMotion) return null;

  return (
    <div className="mt-4">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-3">
        <p className="text-blue-800 font-medium mb-2">⚖️ Chair Ruling Required</p>
        <p className="text-blue-700 text-sm">
          {state.currentMotion.type === 'pointOrder' &&
            'Rule on whether the point of order is valid.'}
          {state.currentMotion.type === 'questionPrivilege' &&
            'Determine if this is a legitimate question of privilege.'}
          {state.currentMotion.type === 'pointInfo' && 'Provide or allow response to the inquiry.'}
          {state.currentMotion.type === 'withdrawMotion' &&
            'Allow or deny the request to withdraw.'}
        </p>
      </div>

      {state.currentMotion.type === 'pointOrder' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() =>
              dispatch({ type: 'CHAIR_RULING', ruling: 'sustain', timestamp: generateTimestamp() })
            }
            className="bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700"
          >
            Sustain Point
          </button>
          <button
            onClick={() =>
              dispatch({ type: 'CHAIR_RULING', ruling: 'overrule', timestamp: generateTimestamp() })
            }
            className="bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700"
          >
            Overrule Point
          </button>
        </div>
      )}

      {(state.currentMotion.type === 'questionPrivilege' ||
        state.currentMotion.type === 'withdrawMotion') && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() =>
              dispatch({ type: 'CHAIR_RULING', ruling: 'allow', timestamp: generateTimestamp() })
            }
            className="bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700"
          >
            Allow Request
          </button>
          <button
            onClick={() =>
              dispatch({ type: 'CHAIR_RULING', ruling: 'deny', timestamp: generateTimestamp() })
            }
            className="bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700"
          >
            Deny Request
          </button>
        </div>
      )}

      {state.currentMotion.type === 'pointInfo' && (
        <button
          onClick={() =>
            dispatch({ type: 'CHAIR_RULING', ruling: 'allow', timestamp: generateTimestamp() })
          }
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
        >
          Acknowledge & Respond
        </button>
      )}
    </div>
  );
}

// Sub-component for voting method controls
function VotingMethodControls({
  state,
  dispatch,
}: {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}) {
  return (
    <>
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Voting Method</label>
        <select
          value={state.votingMethod}
          onChange={(e) =>
            dispatch({ type: 'SET_VOTING_METHOD', method: e.target.value as VotingMethod })
          }
          className="w-full p-2 border rounded-lg mb-3 bg-white"
        >
          <option value="standard">Standard Vote (Yea/Nay/Abstain)</option>
          <option value="ballot">Secret Ballot (anonymous)</option>
          <option value="rollcall">Roll Call Vote (recorded)</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() =>
            dispatch({ type: 'REQUEST_UNANIMOUS_CONSENT', timestamp: generateTimestamp() })
          }
          className="bg-green-500 text-white py-3 rounded-lg font-medium"
        >
          Ask for Consent
        </button>
        <button
          onClick={() =>
            dispatch({
              type: 'OPEN_VOTING',
              voteTimerEnd: calculateTimerEnd(state.voteTimeLimit),
              timestamp: generateTimestamp(),
            })
          }
          className="bg-indigo-600 text-white py-3 rounded-lg font-medium"
        >
          Call the Question
        </button>
      </div>
    </>
  );
}
