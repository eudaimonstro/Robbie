import { useId, useState, type FormEvent } from 'react';
import type {
  MeetingAction,
  MeetingState,
  Member,
  Votes,
  VotingMethod,
} from '@robbie-bylawyer/shared/types';
import {
  NO_VOTES,
  addVotes,
  canChairVoteDecide,
  generateTimestamp,
  motionThreshold,
  votesNeeded,
  votingMethodNow,
} from '@robbie-bylawyer/shared/utils';
import { TimerLine } from '../TimerLine';

interface VoteControlProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  /** The signed-in user: the chair, or an admin, who votes like a member */
  me: Member | null;
}

const METHODS: Array<{ value: VotingMethod; label: string }> = [
  { value: 'standard', label: 'On devices and in the room' },
  { value: 'voice', label: 'Voice vote or show of hands' },
  { value: 'ballot', label: 'Secret ballot' },
  { value: 'rollcall', label: 'Roll call' },
];

const CHOICES = ['yea', 'nay', 'abstain'] as const;
const CHOICE_LABELS = { yea: 'Yea', nay: 'Nay', abstain: 'Abstain' } as const;

/**
 * The vote panel: how the vote is taken, then, while it is open, the device votes, the chair's
 * count of the room, the two together, the chair's deciding vote, an admin's own vote, and
 * Close the vote. The voting time is advisory, shown to the chair alone: the vote closes when the
 * chair closes it.
 */
export function VoteControl({ state, dispatch, me }: VoteControlProps) {
  const methodId = useId();
  const motion = state.currentMotion;

  if (!state.votingOpen) {
    if (!motion || motion.vote === 'none' || state.pendingSecond) return null;
    return (
      <section className="card p-5">
        <label htmlFor={methodId} className="label-caps">
          How the vote is taken
        </label>
        <select
          id={methodId}
          className="select mt-2"
          value={state.votingMethod}
          onChange={(e) =>
            dispatch({ type: 'SET_VOTING_METHOD', method: e.target.value as VotingMethod })
          }
        >
          {METHODS.map((method) => (
            <option key={method.value} value={method.value}>
              {method.label}
            </option>
          ))}
        </select>
      </section>
    );
  }

  return <OpenVote state={state} dispatch={dispatch} me={me} />;
}

function OpenVote({ state, dispatch, me }: VoteControlProps) {
  // A division counts this voice vote, on devices and in the room
  const method = votingMethodNow(state);
  const floor = state.floorVotes ?? NO_VOTES;
  const combined = addVotes(state.votes, floor);
  const motion = state.currentMotion;
  const requirement = motion
    ? motionThreshold(motion)
    : { fraction: 'majority' as const, of: 'cast' as const };
  // Of all the voting members: the yes votes the question needs, whoever abstains
  const needed = votesNeeded(requirement);
  // The chair may declare a voice vote's result without a count on a question decided by a
  // majority of the votes cast (a vote of two thirds, or of all the members, is counted, and so
  // is a bylaw amendment), as the server rules
  const declarable =
    method === 'voice' &&
    !!motion &&
    motion.type !== 'bylawAmendment' &&
    requirement.of === 'cast' &&
    requirement.fraction === 'majority';
  const iVoted = me !== null && state.voters.includes(me.id);
  const myVote = me ? state.voterChoices[me.id] : undefined;
  const floorEntered = floor.yea + floor.nay + floor.abstain > 0;

  // The chair votes only when that would change the result, judged on the devices and the room
  // together, as the server judges it; on a secret ballot the chair votes like anyone
  const chairMayDecide =
    me?.role === 'chair' &&
    (method === 'standard' || method === 'rollcall') &&
    !iVoted &&
    canChairVoteDecide(combined, requirement);
  const ownVote =
    me !== null &&
    method !== 'voice' &&
    (me.role === 'admin' || (me.role === 'chair' && method === 'ballot'));
  // The server judged the chair's vote on the count in the room as it stood, so once the chair
  // has voted (outside a secret ballot) the count can no longer change
  const chair = state.members.find((m) => m.role === 'chair');
  const tallyLocked = !!chair && method !== 'ballot' && state.voters.includes(chair.id);
  // A voice vote is counted only in the room: the server refuses to close it on no count
  const closeBlocked = method === 'voice' && !floorEntered;
  // The bottom button closes a counted vote; a voice vote declared above needs no count

  return (
    <section className="card space-y-5 p-5" aria-labelledby="vote-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="vote-heading" className="label-caps">
          Vote in progress
        </h3>
        <span className="text-sm text-ink-muted">
          {METHODS.find((m) => m.value === method)?.label}
        </span>
      </div>

      {/* A guide for the chair only: the vote closes when the chair closes it */}
      {state.voteTimerEnd && (
        <TimerLine
          endTime={state.voteTimerEnd}
          totalSeconds={state.voteTimeLimit}
          label="Voting time"
          expired="Time is up. Close the vote when the room has voted."
        />
      )}

      {needed !== null && (
        <p className="text-sm font-medium tabular-nums text-ink">
          {`${needed} yes votes needed: ${combined.yea} so far`}
        </p>
      )}

      {method === 'voice' ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">
            {declarable
              ? 'Answered aloud in the room. Declare what you heard, or enter a count below.'
              : 'Counted in the room: enter the count below.'}
          </p>
          {declarable && (
            <div className="flex flex-wrap gap-2">
              {(['ayes', 'noes'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() =>
                    dispatch({
                      type: 'CLOSE_VOTING',
                      declared: side,
                      timestamp: generateTimestamp(),
                    })
                  }
                >
                  {side === 'ayes' ? 'The ayes have it' : 'The noes have it'}
                </button>
              ))}
            </div>
          )}
          {/* Someone in the room doubts it: the vote is counted, on devices and by hand */}
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() =>
              dispatch({
                type: 'REQUEST_DIVISION',
                fromFloor: true,
                timestamp: generateTimestamp(),
              })
            }
          >
            Division called from the floor
          </button>
        </div>
      ) : method === 'ballot' ? (
        <p className="text-ink">
          <span className="animate-count-pulse font-serif-soft text-page font-semibold tabular-nums">
            {state.voters.length}
          </span>{' '}
          ballots received on devices. The counts stay hidden until the vote closes.
        </p>
      ) : (
        <div className="space-y-2">
          <dl className="grid grid-cols-3 gap-3">
            {CHOICES.map((choice) => (
              <div
                key={choice}
                className="flex flex-col-reverse rounded-lg bg-surface-2 p-3 text-center"
              >
                <dt className="label-caps">{CHOICE_LABELS[choice]} on devices</dt>
                <dd className="animate-count-pulse font-serif-soft text-page font-semibold tabular-nums text-ink">
                  {state.votes[choice]}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm tabular-nums text-ink-muted">
            {state.voters.length} voted on devices
          </p>
        </div>
      )}

      {/* Keyed on the tally the meeting has, so an entry from another console resets the form */}
      <FloorTallyForm
        key={`${floor.yea}|${floor.nay}|${floor.abstain}`}
        floor={floor}
        dispatch={dispatch}
        locked={tallyLocked}
      />

      {floorEntered && method !== 'ballot' && (
        <p className="text-sm font-medium tabular-nums text-ink">
          Together: {combined.yea} to {combined.nay}
          {combined.abstain > 0 && `, ${combined.abstain} abstaining`}
        </p>
      )}

      {chairMayDecide && me && (
        <div className="rounded-lg bg-gavel-tint p-3">
          <p className="mb-2 text-sm font-medium text-ink">
            {combined.yea === combined.nay
              ? 'The chair may vote to break the tie'
              : "The chair may vote: the chair's vote would change the result"}
          </p>
          {!floorEntered && (
            <p className="mb-2 text-xs text-ink-muted">
              Enter the count in the room first: it cannot change once the chair votes.
            </p>
          )}
          <div className="flex gap-2">
            {(['yea', 'nay'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                className="btn-secondary btn-sm"
                onClick={() =>
                  dispatch({
                    type: 'CAST_VOTE',
                    vote: choice,
                    voterId: me.id,
                    isChairDecidingVote: true,
                  })
                }
              >
                {`Vote ${choice}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {ownVote && me && (
        <div>
          <p className="label-caps mb-2">Your vote</p>
          <div className="flex gap-2">
            {CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={myVote === choice}
                className={myVote === choice ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                onClick={() => dispatch({ type: 'CAST_VOTE', vote: choice, voterId: me.id })}
              >
                {`Vote ${choice}`}
              </button>
            ))}
          </div>
          {method === 'ballot' && iVoted && (
            <p role="status" className="mt-2 text-sm text-carried">
              Vote recorded
            </p>
          )}
        </div>
      )}

      {closeBlocked && (
        <p className="text-sm text-ink-muted">Enter the show of hands before closing</p>
      )}
      <button
        type="button"
        className="btn-primary w-full"
        disabled={closeBlocked}
        onClick={() => dispatch({ type: 'CLOSE_VOTING', timestamp: generateTimestamp() })}
      >
        Close the vote
      </button>
    </section>
  );
}

/** The chair's count of the room: replaces the last entry */
function FloorTallyForm({
  floor,
  dispatch,
  locked,
}: {
  floor: Votes;
  dispatch: React.Dispatch<MeetingAction>;
  /** The chair has voted: the server refuses a new count */
  locked: boolean;
}) {
  const id = useId();
  const [counts, setCounts] = useState({
    yea: String(floor.yea),
    nay: String(floor.nay),
    abstain: String(floor.abstain),
  });
  const [problem, setProblem] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = {
      yea: Number(counts.yea.trim() || '0'),
      nay: Number(counts.nay.trim() || '0'),
      abstain: Number(counts.abstain.trim() || '0'),
    };
    if (Object.values(parsed).some((n) => !Number.isInteger(n) || n < 0)) {
      setProblem('Counts are whole numbers, 0 or more');
      return;
    }
    setProblem(null);
    dispatch({ type: 'SET_FLOOR_TALLY', ...parsed, timestamp: generateTimestamp() });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <p className="label-caps">In the room</p>
      <p className="text-xs text-ink-muted">
        The show of hands of people not voting on a device. A new entry replaces the last.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {CHOICES.map((choice) => (
          <div key={choice}>
            <label htmlFor={`${id}-${choice}`} className="label">
              {`${CHOICE_LABELS[choice]} in the room`}
            </label>
            <input
              id={`${id}-${choice}`}
              className="input tabular-nums"
              inputMode="numeric"
              disabled={locked}
              value={counts[choice]}
              onChange={(e) => setCounts({ ...counts, [choice]: e.target.value })}
            />
          </div>
        ))}
      </div>
      {locked && (
        <p className="text-sm text-ink-muted">
          The floor tally must be entered before the chair votes
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-gavel">
          {problem}
        </p>
      )}
      <button type="submit" className="btn-secondary btn-sm" disabled={locked}>
        Enter the count
      </button>
    </form>
  );
}
