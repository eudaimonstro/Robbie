import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronRight, CheckCircle } from 'lucide-react';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import { getValidMotions, generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type {
  ParticipantViewProps,
  SuspendableRule,
  AgendaAmendment,
  BylawAmendment,
  MotionDefinition,
} from '../types';
import { AgendaAmendmentForm } from '../components/AgendaAmendmentForm';
import { BylawAmendmentForm } from '../components/BylawAmendmentForm';
import { SuspendRulesForm } from '../components/SuspendRulesForm';
import { TakeFromTableForm } from '../components/TakeFromTableForm';
import { ReconsiderForm } from '../components/ReconsiderForm';
import { InquiryPanel } from '../components/InquiryPanel';
import { NominationsPanel } from '../components/NominationsPanel';
import { ElectionPanel } from '../components/ElectionPanel';
import { ActiveSuspensionsBanner } from '../components/ActiveSuspensionsBanner';
import { CountdownTimer } from '../components/CountdownTimer';
import { QuorumWarning } from '../components/QuorumWarning';
import {
  VotingPanel,
  SpeakerRecognitionPanel,
  VoteResultsPanel,
  ProxyRequestPanel,
  ProxyAcceptancePanel,
  CurrentBusinessPanel,
  MotionSelector,
} from '../components/participant';
import { useVoteResults } from '../hooks/useVoteResults';
import { useQuorumStatus } from '../hooks/useQuorumStatus';

export function ParticipantView({ state, dispatch, currentUser }: ParticipantViewProps) {
  const [motionText, setMotionText] = useState('');
  const [selectedMotion, setSelectedMotion] = useState('mainMotion');
  const [showAgendaAmendForm, setShowAgendaAmendForm] = useState(false);
  const [showBylawAmendForm, setShowBylawAmendForm] = useState(false);
  const [showSuspendRulesForm, setShowSuspendRulesForm] = useState(false);
  const [showTakeFromTableForm, setShowTakeFromTableForm] = useState(false);
  const [showReconsiderForm, setShowReconsiderForm] = useState(false);

  // Memoize expensive computations
  const validMotions = useMemo(
    () => getValidMotions(state, currentUser.id),
    [state, currentUser.id],
  );
  const selectedMotionDef = MOTIONS[selectedMotion];
  const handRaised = useMemo(
    () => state.speakerQueue.find((s) => s.member.id === currentUser.id),
    [state.speakerQueue, currentUser.id],
  );
  const hasFloor = state.recognizedSpeaker?.id === currentUser.id;

  // Memoize motion grouping by category
  const groupedMotions = useMemo(() => {
    return validMotions.reduce<Record<string, Array<MotionDefinition & { key: string }>>>(
      (acc, m) => {
        if (!acc[m.category]) acc[m.category] = [];
        acc[m.category].push(m);
        return acc;
      },
      {},
    );
  }, [validMotions]);

  // Use custom hooks
  const voteResults = useVoteResults(state.meetingLog);
  const { presentCount, hasQuorum } = useQuorumStatus(state);

  useEffect(() => {
    if (!validMotions.find((m) => m.key === selectedMotion) && validMotions.length > 0) {
      setSelectedMotion(validMotions[0].key);
    }
  }, [validMotions, selectedMotion]);

  const handleMotionSubmit = useCallback(() => {
    if (selectedMotion === 'amendAgenda') {
      setShowAgendaAmendForm(true);
    } else if (selectedMotion === 'bylawAmendment') {
      setShowBylawAmendForm(true);
    } else if (selectedMotion === 'suspendRules') {
      setShowSuspendRulesForm(true);
    } else if (selectedMotion === 'takeFromTable') {
      setShowTakeFromTableForm(true);
    } else if (selectedMotion === 'reconsider') {
      setShowReconsiderForm(true);
    } else {
      dispatch({
        type: 'MAKE_MOTION',
        motionType: selectedMotion,
        text: motionText || selectedMotionDef?.phrase,
        mover: currentUser.name,
        moverId: currentUser.id,
        motionId: generateId(),
        timestamp: generateTimestamp(),
      });
      setMotionText('');
    }
  }, [selectedMotion, motionText, selectedMotionDef, currentUser, dispatch]);

  const handleAgendaAmendSubmit = useCallback(
    (text: string, agendaAmendment: AgendaAmendment) => {
      dispatch({
        type: 'MAKE_MOTION',
        motionType: 'amendAgenda',
        text,
        mover: currentUser.name,
        moverId: currentUser.id,
        agendaAmendment,
        motionId: generateId(),
        timestamp: generateTimestamp(),
      });
      setShowAgendaAmendForm(false);
    },
    [currentUser, dispatch],
  );

  const handleBylawAmendSubmit = useCallback(
    (text: string, bylawAmendment: BylawAmendment) => {
      dispatch({
        type: 'MAKE_MOTION',
        motionType: 'bylawAmendment',
        text,
        mover: currentUser.name,
        moverId: currentUser.id,
        bylawAmendment,
        motionId: generateId(),
        timestamp: generateTimestamp(),
      });
      setShowBylawAmendForm(false);
    },
    [currentUser, dispatch],
  );

  const handleSuspendRulesSubmit = useCallback(
    (
      purpose: string,
      specificAction: string,
      scope: 'single-action' | 'meeting-remainder',
      rule: SuspendableRule,
    ) => {
      const text = `I move to suspend the rules (${rule}) for the following purpose: ${purpose}. Specific action: ${specificAction}`;
      dispatch({
        type: 'MAKE_MOTION',
        motionType: 'suspendRules',
        text,
        mover: currentUser.name,
        moverId: currentUser.id,
        ruleSuspension: { rule, purpose, specificAction, scope },
        motionId: generateId(),
        timestamp: generateTimestamp(),
      });
      setShowSuspendRulesForm(false);
    },
    [currentUser, dispatch],
  );

  const handleTakeFromTableSubmit = useCallback(
    (text: string, tabledMotionId: number) => {
      dispatch({
        type: 'MAKE_MOTION',
        motionType: 'takeFromTable',
        text,
        mover: currentUser.name,
        moverId: currentUser.id,
        tabledMotionId,
        motionId: generateId(),
        timestamp: generateTimestamp(),
      });
      setShowTakeFromTableForm(false);
    },
    [currentUser, dispatch],
  );

  const handleReconsiderSubmit = useCallback(
    (text: string, reconsideredMotionId: number) => {
      dispatch({
        type: 'MAKE_MOTION',
        motionType: 'reconsider',
        text,
        mover: currentUser.name,
        moverId: currentUser.id,
        reconsideredMotionId,
        motionId: generateId(),
        timestamp: generateTimestamp(),
      });
      setShowReconsiderForm(false);
    },
    [currentUser, dispatch],
  );

  return (
    <div className="space-y-4">
      <ActiveSuspensionsBanner state={state} currentUser={currentUser} dispatch={dispatch} />

      {state.meetingActive && (
        <QuorumWarning presentCount={presentCount} quorum={state.quorum} hasQuorum={hasQuorum} />
      )}

      {/* Proxy acceptance panel - shown for members who have pending proxy requests */}
      <ProxyAcceptancePanel state={state} dispatch={dispatch} currentUser={currentUser} />

      {/* Floor control when recognized */}
      {hasFloor && (
        <div className="bg-carried-tint border-2 border-carried/40 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-ink font-semibold text-lg">You have the floor</span>
            <button
              onClick={() => dispatch({ type: 'YIELD_FLOOR', timestamp: generateTimestamp() })}
              className="min-h-[40px] px-4 py-2 bg-carried text-paper rounded-lg font-medium hover:bg-carried/90 touch-manipulation active:scale-[0.98] transition-transform focus:outline-hidden focus:ring-2 focus:ring-gavel focus:ring-offset-2"
            >
              Yield Floor
            </button>
          </div>
          {state.speakerTimerEnd && (
            <CountdownTimer endTime={state.speakerTimerEnd} label="Time Remaining" />
          )}
        </div>
      )}

      {/* Current Business Panel */}
      <CurrentBusinessPanel state={state} dispatch={dispatch} currentUser={currentUser} />

      {/* Voting Panel */}
      <VotingPanel
        state={state}
        dispatch={dispatch}
        currentUser={currentUser}
        hasQuorum={hasQuorum}
        presentCount={presentCount}
      />

      {/* Vote Results Panel */}
      <VoteResultsPanel state={state} voteResults={voteResults} />

      {/* Speaker Recognition Panel */}
      <SpeakerRecognitionPanel
        state={state}
        dispatch={dispatch}
        currentUser={currentUser}
        handRaised={handRaised}
      />

      {/* Proxy request panel - shown for absent members who want to delegate their vote */}
      <ProxyRequestPanel state={state} dispatch={dispatch} currentUser={currentUser} />

      {/* Agenda Display */}
      {state.agendaAdopted && (
        <section className="card p-4" aria-labelledby="agenda-heading">
          <h3 id="agenda-heading" className="font-semibold mb-3 text-ink">
            Agenda
          </h3>
          <ul className="space-y-2" role="list">
            {state.agenda.map((item, i) => (
              <li
                key={item.id}
                className={`flex items-center gap-2 p-2 rounded ${
                  item.status === 'completed'
                    ? 'bg-carried-tint text-ink-muted'
                    : item.status === 'active'
                      ? 'bg-gavel-tint font-medium'
                      : ''
                }`}
              >
                {item.status === 'completed' && (
                  <CheckCircle size={16} className="text-carried" aria-hidden="true" />
                )}
                {item.status === 'active' && (
                  <ChevronRight size={16} className="text-gavel" aria-hidden="true" />
                )}
                <span className={item.status === 'completed' ? 'line-through' : ''}>
                  {i + 1}. {item.title}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Make Motion Panel */}
      {!state.votingOpen &&
        !state.pendingSecond &&
        (state.agendaAdopted || state.agendaObjection) && (
          <section className="card p-4" aria-labelledby="motion-heading">
            <h3 id="motion-heading" className="font-semibold mb-3 text-ink">
              Make a Motion
            </h3>
            {showAgendaAmendForm ? (
              <AgendaAmendmentForm
                agenda={state.agenda}
                onSubmit={handleAgendaAmendSubmit}
                onCancel={() => setShowAgendaAmendForm(false)}
              />
            ) : showBylawAmendForm ? (
              <BylawAmendmentForm
                meetingCode={state.meetingCode || ''}
                onSubmit={handleBylawAmendSubmit}
                onCancel={() => setShowBylawAmendForm(false)}
              />
            ) : showSuspendRulesForm ? (
              <SuspendRulesForm
                onSubmit={handleSuspendRulesSubmit}
                onCancel={() => setShowSuspendRulesForm(false)}
              />
            ) : showTakeFromTableForm ? (
              <TakeFromTableForm
                tabledMotions={state.tabledMotions}
                onSubmit={handleTakeFromTableSubmit}
                onCancel={() => setShowTakeFromTableForm(false)}
              />
            ) : showReconsiderForm ? (
              <ReconsiderForm
                completedMotions={state.completedMotions}
                currentUserId={currentUser.id}
                onSubmit={handleReconsiderSubmit}
                onCancel={() => setShowReconsiderForm(false)}
              />
            ) : (
              <MotionSelector
                selectedMotion={selectedMotion}
                setSelectedMotion={setSelectedMotion}
                selectedMotionDef={selectedMotionDef}
                motionText={motionText}
                setMotionText={setMotionText}
                groupedMotions={groupedMotions}
                onSubmit={handleMotionSubmit}
              />
            )}
          </section>
        )}

      {/* Nominations and elections: members nominate, decline a nomination and cast ballots */}
      {(state.nominationsOpen || state.currentElection) && (
        <NominationsPanel state={state} dispatch={dispatch} currentUser={currentUser} />
      )}
      {state.currentElection && (
        <ElectionPanel state={state} dispatch={dispatch} currentUser={currentUser} />
      )}

      {/* Inquiries Panel */}
      <InquiryPanel state={state} dispatch={dispatch} currentUser={currentUser} isChair={false} />
    </div>
  );
}
