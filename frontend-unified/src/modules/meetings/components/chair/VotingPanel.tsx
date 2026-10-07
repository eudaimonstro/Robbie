import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { canChairVoteDecide, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction } from '@robbie-bylawyer/shared/types';
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
  presentCount,
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

  const chair = useMemo(() => state.members.find((m) => m.role === 'chair'), [state.members]);

  // Memoize voting panel computed values
  const votingData = useMemo(() => {
    if (!state.votingOpen) return null;

    // An admin may preside with no member holding the chair role; the vote can still be closed
    const chairHasVoted = chair ? state.voters.includes(chair.id) : false;
    const { yea, nay } = state.votes;
    const isTied = yea === nay;

    // The chair votes only when that vote would change the result (break or make a tie, or
    // reach or block two-thirds), judged on the votes already cast
    const chairVoteDecides =
      !chairHasVoted && canChairVoteDecide(state.votes, state.currentMotion?.vote ?? 'majority');

    return {
      chairHasVoted,
      yea,
      nay,
      isTied,
      chairVoteDecides,
    };
  }, [state.votingOpen, state.voters, state.votes, state.currentMotion?.vote, chair]);

  if (!state.votingOpen || !votingData) {
    return null;
  }

  return (
    <section className="card p-4" aria-labelledby="voting-heading">
      <h3 id="voting-heading" className="font-semibold mb-3 text-ink">
        Voting
      </h3>

      {!hasQuorum && (
        <div className="mb-3 p-3 bg-caution-tint border-2 border-caution rounded-lg" role="alert">
          <p className="text-ink font-semibold">Voting Without Quorum</p>
          <p className="text-caution-ink text-sm">
            Only {presentCount} of {state.quorum} required members are present. This vote may need
            to be ratified later.
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
            <div
              className="mt-2 p-3 bg-caution-tint border-2 border-caution rounded-lg animate-pulse"
              role="alert"
            >
              <p className="text-ink font-semibold">Voting time has expired</p>
              <p className="text-caution-ink text-sm">
                Consider closing the vote or extending the voting period.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Vote counts - hidden for secret ballots until closed */}
      {state.votingMethod === 'ballot' ? (
        <div className="mb-4 p-4 bg-surface-2 rounded-lg text-center">
          <p className="text-ink-muted mb-2">Secret Ballot in Progress</p>
          <p className="text-2xl font-bold text-ink">{state.voters.length}</p>
          <p className="text-ink-muted text-sm">votes cast</p>
          <p className="text-ink-muted text-xs mt-1">Results hidden until voting closes</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-carried-tint p-4 rounded-lg text-center">
            <p className="text-3xl font-bold text-carried">{votingData.yea}</p>
            <p className="text-carried">Yea</p>
          </div>
          <div className="bg-gavel-tint p-4 rounded-lg text-center">
            <p className="text-3xl font-bold text-gavel">{votingData.nay}</p>
            <p className="text-ink">Nay</p>
          </div>
          <div className="bg-surface-2 p-4 rounded-lg text-center">
            <p className="text-3xl font-bold text-ink">{state.votes.abstain}</p>
            <p className="text-ink-muted">Abstain</p>
          </div>
        </div>
      )}

      {/* Chair voting rules */}
      {state.votingMethod !== 'ballot' &&
        !votingData.chairHasVoted &&
        votingData.chairVoteDecides &&
        chair && (
          <div className="mb-3 p-3 bg-gavel-tint border border-gavel/30 rounded-lg">
            <p className="text-ink font-medium mb-2">
              {votingData.isTied
                ? 'Chair may vote to break the tie'
                : "Chair may vote, since the chair's vote would change the result"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() =>
                  dispatch({
                    type: 'CAST_VOTE',
                    vote: 'yea',
                    voterId: chair.id,
                    isChairDecidingVote: true,
                  })
                }
                className="bg-carried text-paper py-2 rounded-lg font-medium hover:bg-carried/90"
              >
                Vote Yea
              </button>
              <button
                onClick={() =>
                  dispatch({
                    type: 'CAST_VOTE',
                    vote: 'nay',
                    voterId: chair.id,
                    isChairDecidingVote: true,
                  })
                }
                className="bg-gavel text-paper py-2 rounded-lg font-medium hover:bg-gavel/90"
              >
                Vote Nay
              </button>
            </div>
          </div>
        )}

      {state.votingMethod === 'ballot' && !votingData.chairHasVoted && chair && (
        <div className="mb-3 p-3 bg-surface-2 rounded-lg">
          <p className="text-sm text-ink-muted mb-2">
            Secret Ballot - Chair votes like other members
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(['yea', 'nay', 'abstain'] as const).map((vote) => (
              <button
                key={vote}
                onClick={() => dispatch({ type: 'CAST_VOTE', vote, voterId: chair.id })}
                className="bg-ink text-paper py-2 rounded-lg font-medium hover:bg-ink/90"
              >
                Vote {vote === 'yea' ? 'Yea' : vote === 'nay' ? 'Nay' : 'Abstain'}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => dispatch({ type: 'CLOSE_VOTING', timestamp: generateTimestamp() })}
        className="w-full bg-gavel text-paper py-3 rounded-lg font-medium hover:bg-gavel/90"
      >
        Close & Announce
      </button>
    </section>
  );
});
