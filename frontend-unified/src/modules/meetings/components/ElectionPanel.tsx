import { useId, useState, type FormEvent } from 'react';
import {
  acclamationCandidates,
  attendanceSummary,
  countBallot,
  generateId,
  generateTimestamp,
  joinNames,
  winnersOf,
} from '@robbie-bylawyer/shared/utils';
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

/** What the chair is asked to confirm with no quorum present */
type Asking = 'ballot' | 'acclamation' | null;

/**
 * The election once nominations close: the chair opens the ballot with the vote required (or,
 * with no more nominees than seats, declares them elected by acclamation), members cast ballots
 * on their devices (one name, or up to the seats), the chair enters the tellers' count of paper
 * ballots, closes the ballot and declares each winner; seats still open take another ballot
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
  // Opening the ballot or declaring by acclamation without a quorum asks first (the server
  // requires the confirmation)
  const [asking, setAsking] = useState<Asking>(null);
  const [confirmingAcclaim, setConfirmingAcclaim] = useState(false);
  const election = state.currentElection;
  const position = state.currentNominationPosition;
  const nominees = position ? nomineesFor(state, position) : [];
  const acclaimable = acclamationCandidates(state);

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
  const openBallot = (confirmedWithoutQuorum: boolean) => {
    const office = election?.position ?? position;
    if (!office) return;
    dispatch({
      type: 'START_ELECTION',
      electionId: generateId(),
      position: office,
      // The next ballot keeps the vote the election required
      requiredVotes: election?.requiredVotes ?? required,
      ...(confirmedWithoutQuorum && { confirmedWithoutQuorum }),
      timestamp: generateTimestamp(),
    });
  };
  const acclaim = (confirmedWithoutQuorum: boolean) =>
    dispatch({
      type: 'ELECT_BY_ACCLAMATION',
      electionId: generateId(),
      ...(confirmedWithoutQuorum && { confirmedWithoutQuorum }),
      timestamp: generateTimestamp(),
    });
  const ask = (what: Exclude<Asking, null>) => {
    if (!attendance.hasQuorum) {
      setAsking(what);
      return;
    }
    if (what === 'ballot') openBallot(false);
    else acclaim(false);
  };

  // Declaring by acclamation, and the no-quorum question, for the chair before any ballot and
  // between ballots
  const acclamation =
    isChair &&
    acclaimable &&
    (confirmingAcclaim ? (
      // Some bylaws require a ballot even with one nominee: the chair confirms first
      <div role="group" aria-label="Declare elected by acclamation" className="space-y-2">
        <p className="text-sm text-ink">
          {`Declare ${joinNames(acclaimable.names)} elected without a ballot, if your bylaws allow it?`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => {
              setConfirmingAcclaim(false);
              ask('acclamation');
            }}
          >
            Declare elected
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setConfirmingAcclaim(false)}
          >
            Hold a ballot instead
          </button>
        </div>
      </div>
    ) : (
      <div className="space-y-2">
        <p className="text-sm text-ink-muted">
          {acclaimable.names.length === 1
            ? 'With one nominee, the chair may declare them elected without a ballot, if your bylaws allow it.'
            : 'With no more nominees than seats, the chair may declare them elected without a ballot, if your bylaws allow it.'}
        </p>
        <button type="button" className="btn-secondary" onClick={() => setConfirmingAcclaim(true)}>
          Declare elected by acclamation
        </button>
      </div>
    ));
  const noQuorum = (
    <NoQuorumDialog
      isOpen={asking !== null}
      attendance={`${attendance.present} present, ${attendance.quorum} needed`}
      question={
        asking === 'acclamation' ? 'Declare them elected anyway?' : 'Open the ballot anyway?'
      }
      confirmText={
        asking === 'acclamation' ? 'Declare them elected anyway' : 'Open the ballot anyway'
      }
      onOpen={() => {
        const what = asking;
        setAsking(null);
        if (what === 'ballot') openBallot(true);
        else acclaim(true);
      }}
      onWait={() => setAsking(null)}
    />
  );

  if (!election) {
    if (!isChair || state.nominationsOpen || !position) return null;
    const seats = state.openSeats ?? 1;
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
        {seats > 1 && <p className="text-sm text-ink">{`Seats to fill: ${seats}`}</p>}
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
        <button type="button" className="btn-primary" onClick={() => ask('ballot')}>
          Open the ballot
        </button>
        {acclamation}
        {noQuorum}
      </>,
    );
  }

  const voted = election.votersWhoVoted.includes(currentUser.id);
  const canVote = currentUser.role !== 'guest';
  const seats = election.seats ?? 1;

  if (election.votingInProgress) {
    const nothingCast = countBallot(election).totals.cast === 0;
    const ballot =
      canVote &&
      (voted ? (
        <p role="status" className="text-sm font-medium text-carried">
          Ballot recorded
        </p>
      ) : seats > 1 ? (
        <SeveralSeatsBallot
          election={election}
          seats={seats}
          compact={isChair}
          onCast={(names) =>
            dispatch({ type: 'CAST_BALLOT', candidateNames: names, voterId: currentUser.id })
          }
        />
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
              key={JSON.stringify([
                election.floorBallots,
                election.floorWriteIns,
                election.floorBlank,
                election.floorIllegal,
                election.floorBallotCount,
              ])}
              election={election}
              dispatch={dispatch}
            />
            {/* A ballot nobody cast decides nothing: the server refuses to close it */}
            {nothingCast && (
              <p className="text-sm text-ink-muted">
                No ballots yet: wait for the phones, or enter the paper ballots.
              </p>
            )}
            <button
              type="button"
              className="btn-primary w-full"
              disabled={nothingCast}
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

  const winners = winnersOf(election);
  const declaredHere = state.electedOfficers.filter((o) => o.electionId === election.id);
  return frame(
    `Election for ${election.position}`,
    <>
      <p className="text-sm tabular-nums text-ink">{electionTally(election)}</p>
      {winners.length > 0 ? (
        <>
          <p className="text-sm font-medium text-carried">
            {`${joinNames(winners)} ${winners.length > 1 ? 'have' : 'has'} the vote required.`}
          </p>
          {isChair &&
            winners.map((winner, index) => (
              <button
                key={winner}
                type="button"
                className={index === 0 ? 'btn-primary' : 'btn-secondary'}
                onClick={() =>
                  dispatch({
                    type: 'DECLARE_ELECTED',
                    candidateName: winner,
                    timestamp: generateTimestamp(),
                  })
                }
              >
                {`Declare ${winner} elected`}
              </button>
            ))}
        </>
      ) : declaredHere.length > 0 ? (
        <>
          <p className="text-sm text-ink">
            {`${joinNames(declaredHere.map((o) => o.name))} ${declaredHere.length > 1 ? 'are' : 'is'} elected. `}
            {seats === 1 ? 'One seat is still open' : `${seats} seats are still open`}
            {election.candidates.length > 0
              ? `: ${election.candidates.map((c) => c.name).join(', ')}.`
              : ', and nobody is left to vote for. Reopen nominations, or set the election aside.'}
          </p>
          {isChair && election.candidates.length > 0 && (
            <button type="button" className="btn-primary" onClick={() => ask('ballot')}>
              Open the next ballot
            </button>
          )}
          {acclamation}
          {noQuorum}
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

/** A ballot for several seats: check up to that many names, then cast it */
function SeveralSeatsBallot({
  election,
  seats,
  compact,
  onCast,
}: {
  election: Election;
  seats: number;
  /** The chair's own ballot in the console: smaller */
  compact: boolean;
  onCast: (names: string[]) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const toggle = (name: string) =>
    setChosen((names) =>
      names.includes(name) ? names.filter((n) => n !== name) : [...names, name],
    );
  return (
    <fieldset className="space-y-2" aria-label="Your ballot">
      <legend className="label-caps">{`Choose up to ${seats}`}</legend>
      {election.candidates.map((candidate) => {
        const checked = chosen.includes(candidate.name);
        return (
          <label
            key={candidate.name}
            className={`flex items-center gap-3 rounded-lg border border-rule ${compact ? 'px-3 py-2 text-sm' : 'px-4 py-3'} text-ink`}
          >
            <input
              type="checkbox"
              className="h-5 w-5 accent-gavel"
              checked={checked}
              // No more names than seats
              disabled={!checked && chosen.length >= seats}
              onChange={() => toggle(candidate.name)}
            />
            {candidate.name}
          </label>
        );
      })}
      <p className="text-sm tabular-nums text-ink-muted">{`${chosen.length} of ${seats} chosen`}</p>
      <button
        type="button"
        className={compact ? 'btn-primary btn-sm w-full' : 'btn-primary btn-lg w-full'}
        disabled={chosen.length === 0}
        // In the order on the ballot
        onClick={() =>
          onCast(election.candidates.map((c) => c.name).filter((name) => chosen.includes(name)))
        }
      >
        Cast my ballot
      </button>
    </fieldset>
  );
}

/** A count field: digits only, empty as 0 */
const parseCount = (value: string) => Number(value.trim() || '0');

/**
 * The tellers' count of paper ballots: marks by candidate, names written in, blank and spoiled
 * ballots, and with several seats how many paper ballots were counted. Replaces the last entry.
 */
function FloorBallotsForm({
  election,
  dispatch,
}: {
  election: Election;
  dispatch: React.Dispatch<MeetingAction>;
}) {
  const id = useId();
  const seats = election.seats ?? 1;
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      election.candidates.map((c) => [c.name, String(election.floorBallots?.[c.name] ?? 0)]),
    ),
  );
  const [writeIns, setWriteIns] = useState<Array<{ name: string; count: string }>>(() =>
    Object.entries(election.floorWriteIns ?? {}).map(([name, count]) => ({
      name,
      count: String(count),
    })),
  );
  const [blank, setBlank] = useState(String(election.floorBlank ?? 0));
  const [illegal, setIllegal] = useState(String(election.floorIllegal ?? 0));
  const [ballots, setBallots] = useState(String(election.floorBallotCount ?? 0));
  const [problem, setProblem] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = Object.fromEntries(
      Object.entries(counts).map(([name, value]) => [name, parseCount(value)]),
    );
    const written = writeIns
      .filter((row) => row.name.trim())
      .map((row) => [row.name.trim(), parseCount(row.count)] as const);
    const others = [parseCount(blank), parseCount(illegal), parseCount(ballots)];
    const all = [...Object.values(parsed), ...written.map(([, n]) => n), ...others];
    if (all.some((n) => !Number.isInteger(n) || n < 0)) {
      setProblem('Counts are whole numbers, 0 or more');
      return;
    }
    if (new Set(written.map(([name]) => name.toLowerCase())).size !== written.length) {
      setProblem('Enter each name written in once');
      return;
    }
    setProblem(null);
    const [blankCount, illegalCount, ballotCount] = others;
    dispatch({
      type: 'SET_FLOOR_BALLOTS',
      counts: parsed,
      ...(written.length > 0 ? { writeIns: Object.fromEntries(written) } : {}),
      ...(blankCount > 0 ? { blank: blankCount } : {}),
      ...(illegalCount > 0 ? { illegal: illegalCount } : {}),
      ...(seats > 1 ? { ballots: ballotCount } : {}),
      timestamp: generateTimestamp(),
    });
  };

  const countField = (
    key: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
  ) => (
    <div>
      <label htmlFor={`${id}-${key}`} className="label">
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        className="input tabular-nums"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label="Paper ballots">
      <p className="label-caps">Paper ballots in the room</p>
      {seats > 1 &&
        countField(
          'ballots',
          'Paper ballots counted, not counting blank ones',
          ballots,
          setBallots,
        )}
      {election.candidates.map((candidate, index) =>
        countField(
          `c${index}`,
          `${candidate.name} in the room`,
          counts[candidate.name] ?? '0',
          (v) => setCounts({ ...counts, [candidate.name]: v }),
        ),
      )}
      {writeIns.map((row, index) => (
        <div key={index} className="grid grid-cols-[1fr_6rem] gap-2">
          <div>
            <label htmlFor={`${id}-w${index}`} className="label">
              Name written in
            </label>
            <input
              id={`${id}-w${index}`}
              className="input"
              maxLength={200}
              value={row.name}
              onChange={(e) =>
                setWriteIns(
                  writeIns.map((r, i) => (i === index ? { ...r, name: e.target.value } : r)),
                )
              }
            />
          </div>
          <div>
            <label htmlFor={`${id}-wc${index}`} className="label">
              Votes
            </label>
            <input
              id={`${id}-wc${index}`}
              className="input tabular-nums"
              inputMode="numeric"
              value={row.count}
              onChange={(e) =>
                setWriteIns(
                  writeIns.map((r, i) => (i === index ? { ...r, count: e.target.value } : r)),
                )
              }
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn-ghost btn-sm"
        onClick={() => setWriteIns([...writeIns, { name: '', count: '0' }])}
      >
        Add a name written in
      </button>
      <div className="grid grid-cols-2 gap-2">
        {countField('blank', 'Blank ballots', blank, setBlank)}
        {countField('illegal', 'Spoiled ballots', illegal, setIllegal)}
      </div>
      <p className="text-xs text-ink-muted">
        Blank ballots are not counted. Spoiled (illegal) ballots count among the ballots cast, for
        nobody.
      </p>
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
