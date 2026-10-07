import React from 'react';
import { MessageSquare, Info } from 'lucide-react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import { MotionCard } from '../MotionCard';
import { PendingSecondSection } from './PendingSecondSection';
import { UnanimousConsentSection } from './UnanimousConsentSection';

interface CurrentBusinessPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  currentUser: Member;
}

export const CurrentBusinessPanel = React.memo(function CurrentBusinessPanel({
  state,
  dispatch,
  currentUser,
}: CurrentBusinessPanelProps) {
  return (
    <section className="card p-4" aria-labelledby="current-business-heading">
      <h3
        id="current-business-heading"
        className="font-semibold mb-3 flex items-center gap-2 text-ink"
      >
        <MessageSquare size={18} aria-hidden="true" /> Current Business
      </h3>

      {state.currentAgendaItem && !state.currentMotion && !state.pendingSecond && (
        <div className="mb-3 p-3 bg-gavel-tint border border-gavel/30 rounded-lg">
          <p className="text-xs text-ink-muted uppercase mb-1">Agenda Item</p>
          <p className="font-medium text-ink">{state.currentAgendaItem.title}</p>
        </div>
      )}

      {state.meetingActive &&
        !state.agendaAdopted &&
        !state.agendaObjection &&
        !state.pendingSecond && (
          <div className="space-y-3">
            <div className="bg-gavel-tint border-2 border-gavel/30 rounded-lg p-4">
              <p className="text-ink font-semibold mb-2 flex items-center gap-2">
                <Info size={18} aria-hidden="true" /> Agenda Adoption
              </p>
              <p className="text-ink mb-2">
                The chair is asking: "Is there any objection to adopting the agenda?"
              </p>
              <p className="text-xs text-ink-muted bg-surface p-2 rounded-sm">
                If no one objects, the agenda will be adopted without a vote.
              </p>
            </div>
            <button
              onClick={() => dispatch({ type: 'AGENDA_OBJECTION', timestamp: generateTimestamp() })}
              className="w-full min-h-[56px] bg-gavel text-paper py-4 rounded-xl hover:bg-gavel/90 font-semibold text-lg touch-manipulation active:scale-[0.98] transition-transform focus:outline-hidden focus:ring-2 focus:ring-gavel focus:ring-offset-2"
            >
              I Object to the Agenda!
            </button>
          </div>
        )}

      {state.meetingActive &&
        !state.agendaAdopted &&
        state.agendaObjection &&
        !state.currentMotion &&
        !state.pendingSecond && (
          <div className="p-4 bg-caution-tint border border-caution/40 rounded-lg">
            <p className="text-ink font-medium mb-1">Objection to Agenda</p>
            <p className="text-ink-muted text-sm">
              A motion to adopt or amend the agenda is in order.
            </p>
          </div>
        )}

      {state.pendingSecond ? (
        <PendingSecondSection state={state} dispatch={dispatch} currentUser={currentUser} />
      ) : state.unanimousConsentPending ? (
        <UnanimousConsentSection state={state} dispatch={dispatch} currentUser={currentUser} />
      ) : state.currentMotion ? (
        <MotionCard motion={state.currentMotion} />
      ) : state.agendaAdopted && !state.currentAgendaItem ? (
        <div className="text-center py-6 text-ink-muted">
          <Info size={24} className="mx-auto mb-2 opacity-50" aria-hidden="true" />
          <p>Waiting for Chair to call next item</p>
        </div>
      ) : !state.meetingActive ? (
        <div className="text-center py-6 text-ink-muted">
          <Info size={24} className="mx-auto mb-2 opacity-50" aria-hidden="true" />
          <p>Meeting not started</p>
        </div>
      ) : null}
    </section>
  );
});
