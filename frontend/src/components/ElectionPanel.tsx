import { useState, useMemo, useCallback } from 'react';
import { generateId, generateTimestamp } from '@robbie/shared/utils';
import type { MeetingState, MeetingAction, Member } from '@robbie/shared/types';

interface ElectionPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  currentUser: Member;
  isChair?: boolean;
}

export function ElectionPanel({ state, dispatch, currentUser, isChair = false }: ElectionPanelProps) {
  const [requiredVotes, setRequiredVotes] = useState<'majority' | 'plurality' | '2/3'>('majority');

  const handleStartElection = useCallback(() => {
    if (!state.currentNominationPosition) return;

    dispatch({
      type: 'START_ELECTION',
      electionId: generateId(),
      position: state.currentNominationPosition,
      requiredVotes,
      timestamp: generateTimestamp()
    });
  }, [dispatch, state.currentNominationPosition, requiredVotes]);

  const handleCastBallot = useCallback((candidateName: string) => {
    if (!state.currentElection) return;

    dispatch({
      type: 'CAST_BALLOT',
      candidateName,
      voterId: currentUser.id
    });
  }, [dispatch, state.currentElection, currentUser.id]);

  const handleCloseElection = useCallback(() => {
    dispatch({
      type: 'CLOSE_ELECTION',
      timestamp: generateTimestamp()
    });
  }, [dispatch]);

  const handleDeclareElected = useCallback((candidateName: string) => {
    dispatch({
      type: 'DECLARE_ELECTED',
      candidateName,
      timestamp: generateTimestamp()
    });
  }, [dispatch]);

  const hasVoted = useMemo(
    () => state.currentElection?.votersWhoVoted.includes(currentUser.id),
    [state.currentElection?.votersWhoVoted, currentUser.id]
  );

  return (
    <section className="bg-white rounded-lg p-4 shadow" aria-labelledby="election-heading">
      <h3 id="election-heading" className="font-semibold mb-3 text-gray-800 flex items-center gap-2">
        <span aria-hidden="true">🗳️</span> Election
      </h3>

      {/* Chair - Start Election */}
      {isChair && !state.nominationsOpen && !state.currentElection && state.currentNominationPosition && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="font-medium text-gray-900 mb-2">
            Ready to conduct election for: {state.currentNominationPosition}
          </p>
          <p className="text-sm text-gray-700 mb-3">
            Candidates:{' '}
            {state.nominations
              .filter(n => n.position === state.currentNominationPosition && !n.declined)
              .map(n => n.nomineeName)
              .filter((name, index, self) => self.indexOf(name) === index)
              .join(', ') || 'None'}
          </p>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Vote Requirement
            </label>
            <select
              value={requiredVotes}
              onChange={(e) => setRequiredVotes(e.target.value as 'majority' | 'plurality' | '2/3')}
              className="w-full p-2 border rounded text-sm"
            >
              <option value="majority">Majority (more than half)</option>
              <option value="plurality">Plurality (most votes wins)</option>
              <option value="2/3">Two-Thirds (2/3 required)</option>
            </select>
          </div>

          <button
            onClick={handleStartElection}
            className="w-full py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
          >
            Start Election
          </button>
        </div>
      )}

      {/* Active Election - Voting */}
      {state.currentElection && state.currentElection.votingInProgress && (
        <div>
          <div className="p-3 bg-blue-50 border border-blue-300 rounded-lg mb-3">
            <p className="font-semibold text-blue-900">
              Voting for: {state.currentElection.position}
            </p>
            <p className="text-xs text-blue-700 mt-1">
              Requirement: {state.currentElection.requiredVotes === 'majority'
                ? 'Majority (>50%)'
                : state.currentElection.requiredVotes === '2/3'
                ? 'Two-Thirds (≥66.7%)'
                : 'Plurality (most votes)'}
            </p>
            <p className="text-xs text-blue-700 mt-1">
              {state.currentElection.votersWhoVoted.length} vote(s) cast
            </p>
          </div>

          {!hasVoted ? (
            <div className="space-y-2 mb-3" role="group" aria-labelledby="ballot-label">
              <p id="ballot-label" className="text-sm font-medium text-gray-700">Cast Your Ballot:</p>
              {state.currentElection.candidates.map((candidate) => (
                <button
                  key={candidate.name}
                  onClick={() => handleCastBallot(candidate.name)}
                  className="w-full py-3 px-4 bg-white border-2 border-gray-300 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 text-left font-medium transition-colors"
                  aria-label={`Vote for ${candidate.name}`}
                >
                  {candidate.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="p-3 bg-green-50 border border-green-300 rounded-lg mb-3">
              <p className="text-green-800 font-medium">✓ You have voted</p>
              <p className="text-xs text-green-700 mt-1">
                Waiting for other members to vote...
              </p>
            </div>
          )}

          {isChair && (
            <button
              onClick={handleCloseElection}
              className="w-full py-2 bg-gray-600 text-white rounded hover:bg-gray-700 font-medium"
            >
              Close Election
            </button>
          )}
        </div>
      )}

      {/* Election Results */}
      {state.currentElection && !state.currentElection.votingInProgress && (
        <div>
          <div className="p-3 bg-gray-50 border border-gray-300 rounded-lg mb-3">
            <p className="font-semibold text-gray-900 mb-2">
              Election Results: {state.currentElection.position}
            </p>

            <div className="space-y-2 mb-3">
              {Object.entries(state.currentElection.ballotResults)
                .sort((a, b) => b[1] - a[1])
                .map(([name, votes]) => (
                  <div key={name} className="flex items-center justify-between p-2 bg-white rounded border">
                    <span className="font-medium">{name}</span>
                    <span className="text-gray-600">
                      {votes} vote{votes !== 1 ? 's' : ''} (
                      {state.currentElection!.votersWhoVoted.length > 0
                        ? Math.round((votes / state.currentElection!.votersWhoVoted.length) * 100)
                        : 0}
                      %)
                    </span>
                  </div>
                ))}
            </div>

            {state.currentElection.elected ? (
              <div className="p-3 bg-green-50 border border-green-300 rounded mb-3">
                <p className="font-semibold text-green-900">
                  🎉 {state.currentElection.elected} has been elected!
                </p>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded mb-3">
                <p className="font-semibold text-amber-900">
                  ⚠️ No candidate elected
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  The required {state.currentElection.requiredVotes} vote was not achieved.
                  {isChair && ' Chair may re-open nominations or hold a new ballot.'}
                </p>
              </div>
            )}
          </div>

          {isChair && state.currentElection.elected && (
            <button
              onClick={() => handleDeclareElected(state.currentElection!.elected!)}
              className="w-full py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
            >
              Officially Declare Elected
            </button>
          )}
        </div>
      )}
    </section>
  );
}
