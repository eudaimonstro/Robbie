import { useState, useMemo, useCallback } from 'react';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';

interface NominationsPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  currentUser: Member;
  isChair?: boolean;
}

export function NominationsPanel({
  state,
  dispatch,
  currentUser,
  isChair = false,
}: NominationsPanelProps) {
  const [position, setPosition] = useState('');
  const [nomineeName, setNomineeName] = useState('');

  const handleOpenNominations = useCallback(() => {
    if (!position.trim()) return;
    dispatch({
      type: 'OPEN_NOMINATIONS',
      position: position.trim(),
      timestamp: generateTimestamp(),
    });
    setPosition('');
  }, [dispatch, position]);

  const handleNominate = useCallback(() => {
    if (!nomineeName.trim() || !state.currentNominationPosition) return;

    // Check if nominee is a member
    const nominee = state.members.find(
      (m) => m.name.toLowerCase() === nomineeName.trim().toLowerCase(),
    );

    dispatch({
      type: 'NOMINATE',
      position: state.currentNominationPosition,
      nomineeName: nomineeName.trim(),
      nomineeId: nominee?.id ?? 0,
      nominatedBy: currentUser.name,
      nominatorId: currentUser.id,
      nominationId: generateId(),
      timestamp: generateTimestamp(),
    });
    setNomineeName('');
  }, [
    dispatch,
    nomineeName,
    state.currentNominationPosition,
    state.members,
    currentUser.name,
    currentUser.id,
  ]);

  const handleDeclineNomination = useCallback(
    (nominationId: number) => {
      dispatch({
        type: 'DECLINE_NOMINATION',
        nominationId,
        timestamp: generateTimestamp(),
      });
    },
    [dispatch],
  );

  const handleCloseNominations = useCallback(() => {
    dispatch({
      type: 'CLOSE_NOMINATIONS',
      timestamp: generateTimestamp(),
    });
  }, [dispatch]);

  const currentPositionNominations = useMemo(
    () => state.nominations.filter((n) => n.position === state.currentNominationPosition),
    [state.nominations, state.currentNominationPosition],
  );

  return (
    <section className="bg-surface rounded-lg p-4 shadow-sm" aria-labelledby="nominations-heading">
      <h3 id="nominations-heading" className="font-semibold mb-3 text-ink flex items-center gap-2">
        Nominations and Elections
      </h3>

      {/* Chair Controls - Open Nominations */}
      {isChair && !state.nominationsOpen && !state.currentElection && (
        <div className="mb-4 p-3 bg-gavel-tint border border-rule rounded-lg">
          <label className="block text-sm font-medium text-ink mb-2">
            Open Nominations for Position
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g., President, Secretary, Treasurer"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="flex-1 p-2 border rounded-sm text-sm"
            />
            <button
              onClick={handleOpenNominations}
              disabled={!position.trim()}
              className="px-4 py-2 bg-gavel text-paper rounded-sm hover:bg-gavel/90 disabled:bg-rule text-sm font-medium"
            >
              Open Nominations
            </button>
          </div>
        </div>
      )}

      {/* Active Nominations */}
      {state.nominationsOpen && state.currentNominationPosition && (
        <div className="mb-4">
          <div
            className="p-3 bg-carried-tint border border-carried/40 rounded-lg mb-3"
            role="status"
            aria-live="polite"
          >
            <p className="font-semibold text-ink">
              Nominations are open for: {state.currentNominationPosition}
            </p>
            <p className="text-xs text-carried mt-1">
              Per RONR, nominations do not require a second. Members may nominate themselves.
            </p>
          </div>

          {/* Nominate Form */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-ink mb-2">Nominate a Candidate</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name of nominee"
                value={nomineeName}
                onChange={(e) => setNomineeName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleNominate()}
                className="flex-1 p-2 border rounded-sm text-sm"
              />
              <button
                onClick={handleNominate}
                disabled={!nomineeName.trim()}
                className="px-4 py-2 bg-gavel text-paper rounded-sm hover:bg-gavel/90 disabled:bg-rule text-sm font-medium"
              >
                Nominate
              </button>
            </div>
          </div>

          {/* Current Nominations List */}
          {currentPositionNominations.length > 0 && (
            <div className="mb-3">
              <p className="text-sm font-medium text-ink mb-2">
                Nominations Received ({currentPositionNominations.filter((n) => !n.declined).length}
                ):
              </p>
              <div className="space-y-2">
                {currentPositionNominations.map((nomination) => (
                  <div
                    key={nomination.id}
                    className={`p-2 rounded border text-sm ${
                      nomination.declined
                        ? 'bg-surface-2 border-rule opacity-60'
                        : 'bg-surface border-rule'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{nomination.nomineeName}</span>
                        {nomination.declined && (
                          <span className="ml-2 text-xs text-ink-muted">(Declined)</span>
                        )}
                        <p className="text-xs text-ink-muted">
                          Nominated by {nomination.nominatedBy}
                        </p>
                      </div>
                      {!nomination.declined && nomination.nomineeId === currentUser.id && (
                        <button
                          onClick={() => handleDeclineNomination(nomination.id)}
                          className="text-xs text-gavel px-2 py-1 rounded-sm hover:bg-gavel-tint hover:text-ink"
                        >
                          Decline
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chair Controls - Close Nominations */}
          {isChair && (
            <button
              onClick={handleCloseNominations}
              className="w-full py-2 bg-ink text-paper rounded-sm hover:bg-ink/90 text-sm font-medium"
            >
              Close Nominations
            </button>
          )}
        </div>
      )}

      {/* Elected Officers */}
      {state.electedOfficers.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink mb-2">Elected Officers:</p>
          <div className="space-y-2">
            {state.electedOfficers.map((officer, index) => (
              <div
                key={index}
                className="p-2 bg-carried-tint border border-carried/40 rounded-sm text-sm"
              >
                <span className="font-medium">{officer.position}:</span>{' '}
                <span className="text-ink">{officer.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
