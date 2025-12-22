import React from 'react';
import { Vote } from 'lucide-react';
import type { MeetingState, MeetingAction, Member } from '@robbie/shared/types';
import { CountdownTimer } from '../CountdownTimer';

interface VotingPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  currentUser: Member;
  hasQuorum: boolean;
  presentCount: number;
}

export const VotingPanel = React.memo(function VotingPanel({
  state,
  dispatch,
  currentUser,
  hasQuorum,
  presentCount
}: VotingPanelProps) {
  if (!state.votingOpen) {
    return null;
  }

  const userVote = state.voterChoices[currentUser.id];

  return (
    <section
      className="bg-white rounded-lg p-4 shadow border-2 border-indigo-200"
      aria-labelledby="voting-heading"
    >
      <h3 id="voting-heading" className="font-semibold mb-2 flex items-center gap-2 text-indigo-700">
        <Vote size={18} aria-hidden="true" />
        {state.votingMethod === 'standard' && 'Vote Now'}
        {state.votingMethod === 'ballot' && 'Secret Ballot'}
        {state.votingMethod === 'rollcall' && 'Roll Call Vote'}
      </h3>

      {!hasQuorum && (
        <div className="mb-3 p-3 bg-amber-100 border-2 border-amber-400 rounded-lg" role="alert">
          <p className="text-amber-800 font-semibold text-sm">⚠️ Voting Without Quorum</p>
          <p className="text-amber-700 text-xs">
            Only {presentCount} of {state.quorum} required members are present.
          </p>
        </div>
      )}

      {state.voteTimerEnd && (
        <div className="mb-3">
          <CountdownTimer endTime={state.voteTimerEnd} label="Voting Time" />
        </div>
      )}

      <p className="text-gray-700 mb-2">"{state.currentMotion?.text}"</p>
      <p className="text-sm text-gray-500 mb-4">
        Requires: {state.currentMotion?.vote === "2/3" ? "Two-thirds" : "Majority"}
      </p>

      {/* Special notice for Appeal votes */}
      {state.currentMotion?.type === 'appeal' && state.lastChairRuling && (
        <div className="mb-4 p-3 bg-purple-50 border-2 border-purple-300 rounded-lg">
          <p className="text-purple-800 font-semibold text-sm mb-1">⚖️ Appealing Chair's Ruling</p>
          <p className="text-purple-700 text-xs">
            <strong>Ruling:</strong> "{state.lastChairRuling.ruling}"
          </p>
          <p className="text-purple-600 text-xs mt-2">
            YEA = Sustain chair | NAY = Overturn chair
          </p>
        </div>
      )}

      {(state.votingMethod === 'standard' || state.votingMethod === 'ballot') && (
        <>
          {state.votingMethod === 'ballot' && (
            <p className="text-sm text-gray-600 mb-3 bg-gray-50 p-2 rounded">
              🔒 Secret Ballot - your vote is anonymous
            </p>
          )}
          {userVote && (
            <p className="text-xs text-blue-600 mb-2 text-center">
              You may change your vote before the chair closes voting
            </p>
          )}
          <VoteButtons
            dispatch={dispatch}
            currentUserId={currentUser.id}
            userVote={userVote}
            method={state.votingMethod}
          />
        </>
      )}

      {state.votingMethod === 'rollcall' && (
        <div className="bg-indigo-50 p-4 rounded-lg">
          <p className="text-indigo-800 font-medium mb-2">Roll Call Vote</p>
          <p className="text-indigo-700 text-sm mb-3">
            Chair will call each member by name. Respond when called.
          </p>
          {userVote && (
            <p className="text-xs text-blue-600 mb-2 text-center">
              You may change your vote before the chair closes voting
            </p>
          )}
          <VoteButtons
            dispatch={dispatch}
            currentUserId={currentUser.id}
            userVote={userVote}
            method="rollcall"
          />
        </div>
      )}

      {state.voters.includes(currentUser.id) && (
        <p className="text-center text-green-600 mt-3 font-medium" role="status">
          ✓ Vote recorded
        </p>
      )}
    </section>
  );
});

// Sub-component for vote buttons
function VoteButtons({
  dispatch,
  currentUserId,
  userVote,
  method
}: {
  dispatch: React.Dispatch<MeetingAction>;
  currentUserId: number;
  userVote: string | undefined;
  method: string;
}) {
  const yeaLabel = method === 'rollcall' ? 'AYE' : 'YEA';
  const nayLabel = method === 'rollcall' ? 'NO' : 'NAY';

  return (
    <div className="grid grid-cols-3 gap-2">
      <button
        onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'yea', voterId: currentUserId })}
        className={`py-${method === 'rollcall' ? '3' : '4'} rounded-lg font-bold text-lg transition-all ${
          userVote === 'yea'
            ? 'bg-green-600 text-white ring-4 ring-green-300'
            : 'bg-green-500 text-white hover:bg-green-600'
        }`}
        aria-pressed={userVote === 'yea'}
      >
        {yeaLabel}{userVote === 'yea' ? ' ✓' : ''}
      </button>
      <button
        onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'nay', voterId: currentUserId })}
        className={`py-${method === 'rollcall' ? '3' : '4'} rounded-lg font-bold text-lg transition-all ${
          userVote === 'nay'
            ? 'bg-red-600 text-white ring-4 ring-red-300'
            : 'bg-red-500 text-white hover:bg-red-600'
        }`}
        aria-pressed={userVote === 'nay'}
      >
        {nayLabel}{userVote === 'nay' ? ' ✓' : ''}
      </button>
      <button
        onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'abstain', voterId: currentUserId })}
        className={`py-${method === 'rollcall' ? '3' : '4'} rounded-lg font-bold transition-all ${
          userVote === 'abstain'
            ? 'bg-gray-600 text-white ring-4 ring-gray-400'
            : 'bg-gray-400 text-white hover:bg-gray-500'
        }`}
        aria-pressed={userVote === 'abstain'}
      >
        ABSTAIN{userVote === 'abstain' ? ' ✓' : ''}
      </button>
    </div>
  );
}
