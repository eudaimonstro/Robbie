import { useId } from 'react';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { electionUnderway } from '../../utils/chairActions';
import { ElectedOfficers, NominationsPanel } from '../NominationsPanel';
import { ElectionPanel } from '../ElectionPanel';

interface ElectionCardProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  /** The chair, or the admin presiding */
  me: Member;
  /** Set the election aside: the console asks first */
  onSetAside?: () => void;
}

/**
 * Elections in the console's side column, one card from start to finish: nominations, then the
 * ballot, then the result, and who has been elected. Any election underway can be set aside.
 * Once the meeting is adjourned it shows only who was elected.
 */
export function ElectionCard({ state, dispatch, me, onSetAside }: ElectionCardProps) {
  const headingId = useId();
  if (state.meetingStage === 'adjourned') {
    if (state.electedOfficers.length === 0) return null;
    return (
      <section className="card p-5" aria-label="Who was elected">
        <ElectedOfficers state={state} />
      </section>
    );
  }
  const position = state.currentElection?.position ?? state.currentNominationPosition;
  const underway = electionUnderway(state);

  return (
    <section className="card space-y-4 p-5" aria-labelledby={headingId}>
      <h3 id={headingId} className="label-caps">
        {position ? `Election for ${position}` : 'Nominations and elections'}
      </h3>
      {/* Each part below a rule, but for the first */}
      <div className="space-y-4 [&>*:first-child]:border-t-0 [&>*:first-child]:pt-0">
        <NominationsPanel state={state} dispatch={dispatch} currentUser={me} isChair embedded />
        <ElectionPanel state={state} dispatch={dispatch} currentUser={me} isChair embedded />
        {underway && onSetAside && (
          <div className="border-t border-rule pt-4">
            <button type="button" className="btn-ghost btn-sm" onClick={onSetAside}>
              Set the election aside
            </button>
          </div>
        )}
        {state.electedOfficers.length > 0 && (
          <div className="border-t border-rule pt-4">
            <ElectedOfficers state={state} />
          </div>
        )}
      </div>
    </section>
  );
}
