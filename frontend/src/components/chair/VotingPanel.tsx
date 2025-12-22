import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { generateTimestamp } from '@robbie/shared/utils';
import type { MeetingState, MeetingAction, Member } from '@robbie/shared/types';
import { CountdownTimer } from '../CountdownTimer';

interface VotingPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  hasQuorum: boolean;
  presentCount: number;
}

export const VotingPanel = React.memo(function VotingPanel({
  state,
  dispatch,
  hasQuorum,
  presentCount
}: VotingPanelProps) {
  const [voteTimeExpired, setVoteTimeExpired] = useState(false);

  // Reset vote time expired state when voting closes
  useEffect(() => {
    if (!state.votingOpen) {
      setVoteTimeExpired(false);
    }
  }, [state.votingOpen]);

  const handleVoteTimeExpired = useCallback(() => {
    setVoteTimeExpired(true);
  }, []);

  const chair = useMemo(
    () => state.members.find(m => m.role === 'chair'),
    [state.members]
  );

  // Memoize voting panel computed values
  const votingData = useMemo(() => {
    if (!state.votingOpen || !chair) return null;

    const chairHasVoted = state.voters.includes(chair.id);
    const { yea, nay } = state.votes;
    const total = yea + nay;
    const threshold = state.currentMotion?.vote === "2/3" ? total * 2/3 : total / 2;
    const currentlyPassing = yea > threshold;
    const isTied = yea === nay;

    // Chair can vote to break tie or create tie
    const canVoteToBreakTie = isTied && !chairHasVoted;
    const canVoteToCreateTie = !isTied && yea === nay + 1 && !chairHasVoted;

    return {
      chairHasVoted,
      yea,
      nay,
      currentlyPassing,
      isTied,
      canVoteToBreakTie,
      canVoteToCreateTie
    };
  }, [state.votingOpen, state.voters, state.votes, state.currentMotion?.vote, chair]);

  if (!state.votingOpen || !votingData) {
    return null;
  }

  return (
    <section className="bg-white rounded-lg p-4 shadow" aria-labelledby="voting-heading">
      <h3 id="voting-heading" className="font-semibold mb-3 text-gray-800">Voting</h3>

      {!hasQuorum && (
        <div className="mb-3 p-3 bg-amber-100 border-2 border-amber-400 rounded-lg" role="alert">
          <p className="text-amber-800 font-semibold">⚠️ Voting Without Quorum</p>
          <p className="text-amber-700 text-sm">
            Only {presentCount} of {state.quorum} required members are present. This vote may need to be ratified later.
          </p>
        </div>
      )}

      {state.voteTimerEnd && (
        <div className="mb-3">
          <CountdownTimer
            endTime={state.voteTimerEnd}
            label="Voting Time"
            onExpired={handleVoteTimeExpired}
          />
          {voteTimeExpired && (
            <div className="mt-2 p-3 bg-amber-100 border-2 border-amber-400 rounded-lg animate-pulse" role="alert">
              <p className="text-amber-800 font-semibold">⏰ Voting time has expired</p>
              <p className="text-amber-700 text-sm">Consider closing the vote or extending the voting period.</p>
            </div>
          )}
        </div>
      )}

      {/* Vote counts - hidden for secret ballots until closed */}
      {state.votingMethod === 'ballot' ? (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg text-center">
          <p className="text-gray-600 mb-2">🔒 Secret Ballot in Progress</p>
          <p className="text-2xl font-bold text-gray-700">{state.voters.length}</p>
          <p className="text-gray-500 text-sm">votes cast</p>
          <p className="text-gray-400 text-xs mt-1">Results hidden until voting closes</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-green-100 p-4 rounded-lg text-center">
            <p className="text-3xl font-bold text-green-700">{votingData.yea}</p>
            <p className="text-green-600">Yea</p>
          </div>
          <div className="bg-red-100 p-4 rounded-lg text-center">
            <p className="text-3xl font-bold text-red-700">{votingData.nay}</p>
            <p className="text-red-600">Nay</p>
          </div>
          <div className="bg-gray-100 p-4 rounded-lg text-center">
            <p className="text-3xl font-bold text-gray-700">{state.votes.abstain}</p>
            <p className="text-gray-600">Abstain</p>
          </div>
        </div>
      )}

      {/* Chair voting rules */}
      {state.votingMethod !== 'ballot' && !votingData.chairHasVoted &&
       (votingData.canVoteToBreakTie || votingData.canVoteToCreateTie) && chair && (
        <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-purple-800 font-medium mb-2">
            {votingData.canVoteToBreakTie && "Chair may vote to break the tie"}
            {votingData.canVoteToCreateTie && "Chair may vote to create a tie (defeat motion)"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'yea', voterId: chair.id, isChairDecidingVote: true })}
              className="bg-green-500 text-white py-2 rounded-lg font-medium"
            >
              Vote Yea
            </button>
            <button
              onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'nay', voterId: chair.id, isChairDecidingVote: true })}
              className="bg-red-500 text-white py-2 rounded-lg font-medium"
            >
              Vote Nay
            </button>
          </div>
        </div>
      )}

      {state.votingMethod === 'ballot' && !votingData.chairHasVoted && chair && (
        <p className="text-sm text-gray-600 mb-3 bg-gray-50 p-2 rounded">
          🔒 Secret Ballot - Chair votes like other members
        </p>
      )}

      <button
        onClick={() => dispatch({ type: 'CLOSE_VOTING', timestamp: generateTimestamp() })}
        className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium"
      >
        Close & Announce
      </button>
    </section>
  );
});
