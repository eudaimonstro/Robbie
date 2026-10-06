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
        className="font-semibold mb-3 flex items-center gap-2 text-secondary-800 dark:text-white"
      >
        <MessageSquare size={18} aria-hidden="true" /> Current Business
      </h3>

      {state.currentAgendaItem && !state.currentMotion && !state.pendingSecond && (
        <div className="mb-3 p-3 bg-meeting-50 dark:bg-meeting-900/20 border border-meeting-200 dark:border-meeting-800 rounded-lg">
          <p className="text-xs text-meeting-600 dark:text-meeting-400 uppercase mb-1">
            Agenda Item
          </p>
          <p className="font-medium text-meeting-900 dark:text-meeting-300">
            {state.currentAgendaItem.title}
          </p>
        </div>
      )}

      {state.meetingActive &&
        !state.agendaAdopted &&
        !state.agendaObjection &&
        !state.pendingSecond && (
          <div className="space-y-3">
            <div className="bg-primary-50 dark:bg-primary-900/20 border-2 border-primary-300 dark:border-primary-700 rounded-lg p-4">
              <p className="text-primary-800 dark:text-primary-300 font-semibold mb-2 flex items-center gap-2">
                <Info size={18} aria-hidden="true" /> Agenda Adoption
              </p>
              <p className="text-secondary-800 dark:text-secondary-200 mb-2">
                The chair is asking: "Is there any objection to adopting the agenda?"
              </p>
              <p className="text-xs text-primary-700 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/40 p-2 rounded">
                If no one objects, the agenda will be adopted without a vote.
              </p>
            </div>
            <button
              onClick={() => dispatch({ type: 'AGENDA_OBJECTION', timestamp: generateTimestamp() })}
              className="w-full min-h-[56px] bg-accent-500 text-white py-4 rounded-xl hover:bg-accent-600 font-semibold text-lg touch-manipulation active:scale-[0.98] transition-transform focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2"
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
          <div className="p-4 bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-800 rounded-lg">
            <p className="text-accent-800 dark:text-accent-300 font-medium mb-1">
              Objection to Agenda
            </p>
            <p className="text-accent-700 dark:text-accent-400 text-sm">
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
        <div className="text-center py-6 text-secondary-500 dark:text-secondary-400">
          <Info size={24} className="mx-auto mb-2 opacity-50" aria-hidden="true" />
          <p>Waiting for Chair to call next item</p>
        </div>
      ) : !state.meetingActive ? (
        <div className="text-center py-6 text-secondary-500 dark:text-secondary-400">
          <Info size={24} className="mx-auto mb-2 opacity-50" aria-hidden="true" />
          <p>Meeting not started</p>
        </div>
      ) : null}
    </section>
  );
});
