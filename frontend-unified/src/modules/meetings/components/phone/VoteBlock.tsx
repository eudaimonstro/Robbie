import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { TimerLine } from '../TimerLine';

interface VoteBlockProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  me: Member;
}

const CHOICES = ['yea', 'nay', 'abstain'] as const;

/**
 * The vote on a phone: three 56px buttons, and the votes of members whose proxy this member
 * holds. A secret ballot's choices never reach the phone, so "Vote recorded" comes from voters.
 */
export function VoteBlock({ state, dispatch, me }: VoteBlockProps) {
  const method = state.votingMethod;
  const labels =
    method === 'rollcall'
      ? { yea: 'Aye', nay: 'No', abstain: 'Abstain' }
      : { yea: 'Yea', nay: 'Nay', abstain: 'Abstain' };
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
      {state.voteTimerEnd && (
        <TimerLine
          endTime={state.voteTimerEnd}
          totalSeconds={state.voteTimeLimit}
          label="Voting time"
        />
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
