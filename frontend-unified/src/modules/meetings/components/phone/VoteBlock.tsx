import { generateTimestamp, votingMethodNow } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';

interface VoteBlockProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  me: Member;
}

const CHOICES = ['yea', 'nay', 'abstain'] as const;

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
            aria-pressed={myVote === choice}
            aria-label={`Vote ${labels[choice].toLowerCase()}`}
            className={`${myVote === choice ? 'btn-primary' : 'btn-secondary'} btn-lg`}
            onClick={() => dispatch({ type: 'CAST_VOTE', vote: choice, voterId: me.id })}
          >
            {labels[choice]}
          </button>
        ))}
      </div>
      {voted && (
        <p role="status" className="text-center text-sm font-medium text-carried">
          {method === 'ballot'
            ? 'Vote recorded'
            : 'Vote recorded. You may change it until the vote closes.'}
        </p>
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
