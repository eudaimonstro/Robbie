import { useRef, useState } from 'react';
import { generateTimestamp, votingMethodNow } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import type { MeetingDispatch } from '../../types/socket';

interface VoteBlockProps {
  state: MeetingState;
  dispatch: MeetingDispatch;
  me: Member;
}

const CHOICES = ['yea', 'nay', 'abstain'] as const;
type Choice = (typeof CHOICES)[number];
/** How long a vote the server took stays shown as tapped while its update is on the way */
const CONFIRMING_MS = 3000;

/** The choices in a homeowner's words, on every kind of vote */
const LABELS = { yea: 'Yes', nay: 'No', abstain: 'Abstain' } as const;

/**
 * The vote on a phone: three 56px buttons (Yes, No, Abstain), and the votes of members whose
 * proxy this member holds. A secret ballot's choices never reach the phone, so "Vote recorded"
 * comes from voters. The voting time is the chair's guide, not shown here: the vote closes when
 * the chair closes it.
 */
export function VoteBlock({ state, dispatch, me }: VoteBlockProps) {
  const method = votingMethodNow(state);
  const labels = LABELS;
  const myVote = state.voterChoices[me.id];
  const voted = state.voters.includes(me.id);
  // The vote tapped, until the meeting's state shows it: "Sending" until the server answers,
  // and "Not sent" with a way to send it again if it doesn't take it (offline, timed out). Each
  // tap is its own request: an answer to an earlier one doesn't change what a later one shows.
  const [pending, setPending] = useState<{
    request: number;
    choice: Choice;
    answered: boolean;
  } | null>(null);
  const [notSent, setNotSent] = useState<Choice | null>(null);
  const requests = useRef(0);
  const cast = (choice: Choice) => myVote === choice || (method === 'ballot' && voted);
  const shown = pending && !(pending.answered && cast(pending.choice)) ? pending : null;
  // A vote the meeting shows as cast after all (sent again, or by another tab) is not "not sent"
  const failed = notSent && !cast(notSent) ? notSent : null;
  const castVote = async (choice: Choice) => {
    const request = ++requests.current;
    setNotSent(null);
    setPending({ request, choice, answered: false });
    const sent = await dispatch({ type: 'CAST_VOTE', vote: choice, voterId: me.id });
    // A later tap took over
    if (request !== requests.current) return;
    if (sent === false) {
      setPending(null);
      setNotSent(choice);
      return;
    }
    setPending({ request, choice, answered: true });
    setTimeout(() => setPending((p) => (p?.request === request ? null : p)), CONFIRMING_MS);
  };
  // A secret ballot never shows a choice, not even this phone's own
  const pressed = (choice: Choice) =>
    method !== 'ballot' && (shown ? shown.choice : myVote) === choice;
  const held = state.allowProxyVoting ? state.proxies.filter((p) => p.grantedTo === me.id) : [];
  const proxyVotes = new Map(
    state.proxyVotes.filter((v) => v.castBy === me.id).map((v) => [v.memberId, v.vote]),
  );

  return (
    <div className="space-y-4">
      <p className="label-caps">
        {method === 'ballot'
          ? 'Secret ballot'
          : method === 'rollcall'
            ? 'Roll call vote'
            : 'Your vote'}
      </p>
      {method === 'ballot' && <p className="text-sm text-ink-muted">Nobody sees how you voted.</p>}
      {state.currentMotion?.type === 'appeal' && (
        <p className="text-sm text-ink-muted">
          Yes keeps the chair&apos;s ruling; No overturns it.
        </p>
      )}
      <div role="group" aria-label="Your vote" className="grid grid-cols-3 gap-2">
        {CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={pressed(choice)}
            aria-busy={shown?.choice === choice && !shown.answered}
            aria-label={`Vote ${labels[choice].toLowerCase()}`}
            className={`${pressed(choice) ? 'btn-primary' : 'btn-secondary'} btn-lg`}
            onClick={() => void castVote(choice)}
          >
            {labels[choice]}
          </button>
        ))}
      </div>
      {shown && !shown.answered ? (
        <p role="status" className="text-center text-sm text-ink-muted">
          Sending your vote...
        </p>
      ) : failed ? (
        <div role="alert" className="flex items-center justify-center gap-3">
          <p className="text-sm font-medium text-caution-ink">Your vote was not sent.</p>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => void castVote(failed)}
          >
            Send again
          </button>
        </div>
      ) : (
        voted && (
          <p role="status" className="text-center text-sm font-medium text-carried">
            {method === 'ballot'
              ? 'Vote recorded'
              : 'Vote recorded. You may change it until the vote closes.'}
          </p>
        )
      )}
      {held.map((proxy) => {
        const cast = proxyVotes.get(proxy.grantedBy);
        return (
          <div key={proxy.id} className="space-y-2 border-t border-rule pt-3">
            <p className="text-sm text-ink">
              By proxy for <span className="font-medium">{proxy.grantedByName}</span>
              {proxy.scope === 'single-vote' && ' (this vote only)'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={cast === choice}
                  aria-label={`Vote ${labels[choice].toLowerCase()} for ${proxy.grantedByName}`}
                  className={`${cast === choice ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  onClick={() =>
                    dispatch({
                      type: 'CAST_PROXY_VOTE',
                      vote: choice,
                      forMemberId: proxy.grantedBy,
                      castById: me.id,
                      timestamp: generateTimestamp(),
                    })
                  }
                >
                  {labels[choice]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
