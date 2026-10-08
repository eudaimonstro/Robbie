import { useId, useState, type FormEvent } from 'react';
import { attendanceSummary, generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import { NoQuorumDialog } from './console/NoQuorumDialog';
import type { Election, MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { electionTally, nomineesFor } from '../utils/question';

interface ElectionPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  /** The signed-in user, who casts a ballot unless a guest */
  currentUser: Member;
  /** The chair, or an admin presiding: opens and closes the ballot and counts the room */
  isChair?: boolean;
  /** Inside the console's election card, which carries the heading */
  embedded?: boolean;
}

type Required = Election['requiredVotes'];

/**
 * The election once nominations close: the chair opens the ballot with the vote required,
 * members cast ballots on their devices, the chair enters the tellers' count of paper ballots
 * by candidate, closes the ballot and declares the winner
 */
export function ElectionPanel({
  state,
  dispatch,
  currentUser,
  isChair = false,
  embedded = false,
}: ElectionPanelProps) {
  const requiredId = useId();
  const headingId = useId();
  const [required, setRequired] = useState<Required>('majority');
  // Opening the ballot without a quorum asks first (the server requires the confirmation)
  const [confirming, setConfirming] = useState(false);
  const election = state.currentElection;
  const position = state.currentNominationPosition;
  const nominees = position ? nomineesFor(state, position) : [];

  /** A card with its heading, or inside the election card a part below a rule */
  const frame = (heading: string, children: React.ReactNode, space = 'space-y-3') =>
    embedded ? (
      <div className={`${space} border-t border-rule pt-4`}>{children}</div>
    ) : (
      <section className={`card ${space} p-5`} aria-labelledby={headingId}>
        <h3 id={headingId} className="label-caps">
          {heading}
        </h3>
        {children}
      </section>
    );

  const attendance = attendanceSummary(state);
  const openBallot = (confirmedWithoutQuorum: boolean) =>
    position &&
    dispatch({
      type: 'START_ELECTION',
      electionId: generateId(),
      position,
      requiredVotes: required,
      ...(confirmedWithoutQuorum && { confirmedWithoutQuorum }),
      timestamp: generateTimestamp(),
    });

  if (!election) {
    if (!isChair || state.nominationsOpen || !position) return null;
    // A ballot with no candidate can't elect anyone, and the server refuses it
    if (nominees.length === 0) {
      return frame(
        `Election for ${position}`,
        <p className="text-sm text-ink">
          Nobody has been nominated. Open nominations again, or set the election aside.
        </p>,
      );
    }
    return frame(
      `Election for ${position}`,
      <>
        <p className="text-sm text-ink">Candidates: {nominees.join(', ')}</p>
        <div>
          <label htmlFor={requiredId} className="label">
            Vote required
          </label>
          <select
            id={requiredId}
            className="select"
            value={required}
            onChange={(e) => setRequired(e.target.value as Required)}
          >
            <option value="majority">A majority of the ballots</option>
            <option value="plurality">A plurality (the most ballots)</option>
            <option value="2/3">Two thirds of the ballots</option>
          </select>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => (attendance.hasQuorum ? openBallot(false) : setConfirming(true))}
        >
          Open the ballot
        </button>
        <NoQuorumDialog
          isOpen={confirming}
          attendance={`${attendance.present} present, ${attendance.quorum} needed`}
          question="Open the ballot anyway?"
          confirmText="Open the ballot anyway"
          onOpen={() => {
            setConfirming(false);
            openBallot(true);
          }}
          onWait={() => setConfirming(false)}
        />
      </>,
    );
  }

  const voted = election.votersWhoVoted.includes(currentUser.id);
  const canVote = currentUser.role !== 'guest';

  if (election.votingInProgress) {
    const ballot =
      canVote &&
      (voted ? (
        <p role="status" className="text-sm font-medium text-carried">
          Ballot recorded
        </p>
      ) : (
        <div role="group" aria-label="Your ballot" className="space-y-2">
          {isChair && <p className="label-caps">Your ballot</p>}
          {election.candidates.map((candidate) => (
            <button
              key={candidate.name}
              type="button"
              // A phone's ballot is its one action; the chair's own ballot is a small part of
              // running the election
              className={isChair ? 'btn-secondary btn-sm w-full' : 'btn-secondary btn-lg w-full'}
              onClick={() =>
                dispatch({
                  type: 'CAST_BALLOT',
                  candidateName: candidate.name,
                  voterId: currentUser.id,
                })
              }
            >
              {`Vote for ${candidate.name}`}
            </button>
          ))}
        </div>
      ));
    return frame(
      `Election for ${election.position}`,
      <>
        <p className="text-sm tabular-nums text-ink-muted">
          <span className="animate-count-pulse">{election.votersWhoVoted.length}</span> ballots
          received on devices
        </p>
        {isChair ? (
          <>
            {ballot && <div className="rounded-lg bg-surface-2 p-3">{ballot}</div>}
            <FloorBallotsForm
              key={JSON.stringify(election.floorBallots ?? {})}
              election={election}
              dispatch={dispatch}
            />
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => dispatch({ type: 'CLOSE_ELECTION', timestamp: generateTimestamp() })}
            >
              Close the ballot
            </button>
          </>
        ) : (
          ballot
        )}
      </>,
      'space-y-4',
    );
  }

  return frame(
    `Election for ${election.position}`,
    <>
      <p className="text-sm tabular-nums text-ink">{electionTally(election)}</p>
      {election.elected ? (
        <>
          <p className="text-sm font-medium text-carried">
            {election.elected} has the vote required.
          </p>
          {isChair && (
            <button
              type="button"
              className="btn-primary"
              onClick={() =>
                dispatch({
                  type: 'DECLARE_ELECTED',
                  candidateName: election.elected!,
                  timestamp: generateTimestamp(),
                })
              }
            >
              {`Declare ${election.elected} elected`}
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-caution-ink">
          Nobody has the vote required.
          {isChair && ' Open nominations again or hold another ballot.'}
        </p>
      )}
    </>,
  );
}

/** The tellers' count of paper ballots by candidate: replaces the last entry */
function FloorBallotsForm({
  election,
  dispatch,
}: {
  election: Election;
  dispatch: React.Dispatch<MeetingAction>;
}) {
  const id = useId();
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      election.candidates.map((c) => [c.name, String(election.floorBallots?.[c.name] ?? 0)]),
    ),
  );
  const [problem, setProblem] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = Object.fromEntries(
      Object.entries(counts).map(([name, value]) => [name, Number(value.trim() || '0')]),
    );
    if (Object.values(parsed).some((n) => !Number.isInteger(n) || n < 0)) {
      setProblem('Counts are whole numbers, 0 or more');
      return;
    }
    setProblem(null);
    dispatch({ type: 'SET_FLOOR_BALLOTS', counts: parsed, timestamp: generateTimestamp() });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <p className="label-caps">Paper ballots in the room</p>
      {election.candidates.map((candidate, index) => (
        <div key={candidate.name}>
          <label htmlFor={`${id}-${index}`} className="label">
            {`${candidate.name} in the room`}
          </label>
          <input
            id={`${id}-${index}`}
            className="input tabular-nums"
            inputMode="numeric"
            value={counts[candidate.name] ?? '0'}
            onChange={(e) => setCounts({ ...counts, [candidate.name]: e.target.value })}
          />
        </div>
      ))}
      {problem && (
        <p role="alert" className="text-sm text-gavel">
          {problem}
        </p>
      )}
      <button type="submit" className="btn-secondary btn-sm">
        Enter the paper ballots
      </button>
    </form>
  );
}
