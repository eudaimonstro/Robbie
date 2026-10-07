import { useId } from 'react';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { ElectedOfficers, NominationsPanel } from '../NominationsPanel';
import { ElectionPanel } from '../ElectionPanel';

interface ElectionCardProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  /** The chair, or the admin presiding */
  me: Member;
}

/**
 * Elections in the console's side column, one card from start to finish: nominations, then the
 * ballot, then the result, and who has been elected
 */
export function ElectionCard({ state, dispatch, me }: ElectionCardProps) {
  const headingId = useId();
  if (state.meetingStage === 'adjourned' && state.electedOfficers.length === 0) return null;
  const position = state.currentElection?.position ?? state.currentNominationPosition;

  return (
    <section className="card space-y-4 p-5" aria-labelledby={headingId}>
      <h3 id={headingId} className="label-caps">
        {position ? `Election for ${position}` : 'Nominations and elections'}
      </h3>
      {/* Each part below a rule, but for the first */}
      <div className="space-y-4 [&>*:first-child]:border-t-0 [&>*:first-child]:pt-0">
        <NominationsPanel state={state} dispatch={dispatch} currentUser={me} isChair embedded />
        <ElectionPanel state={state} dispatch={dispatch} currentUser={me} isChair embedded />
        {state.electedOfficers.length > 0 && (
          <div className="border-t border-rule pt-4">
            <ElectedOfficers state={state} />
          </div>
        )}
      </div>
    </section>
  );
}
