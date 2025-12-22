import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronRight, AlertCircle, MessageSquare, Info, CheckCircle } from 'lucide-react';
import { MOTIONS, CATEGORY_INFO } from '@robbie/shared/constants';
import { getValidMotions, generateId, generateTimestamp } from '@robbie/shared/utils';
import type { ParticipantViewProps, SuspendableRule, AgendaAmendment, MotionDefinition } from '../types';
import { MotionCard } from '../components/MotionCard';
import { HelpTooltip } from '../components/HelpTooltip';
import { AgendaAmendmentForm } from '../components/AgendaAmendmentForm';
import { SuspendRulesForm } from '../components/SuspendRulesForm';
import { TakeFromTableForm } from '../components/TakeFromTableForm';
import { ReconsiderForm } from '../components/ReconsiderForm';
import { InquiryPanel } from '../components/InquiryPanel';
import { ActiveSuspensionsBanner } from '../components/ActiveSuspensionsBanner';
import { CountdownTimer } from '../components/CountdownTimer';
import { QuorumWarning } from '../components/QuorumWarning';
import { VotingPanel, SpeakerRecognitionPanel, VoteResultsPanel, ProxyRequestPanel, ProxyAcceptancePanel } from '../components/participant';
import { useVoteResults } from '../hooks/useVoteResults';
import { useQuorumStatus } from '../hooks/useQuorumStatus';

export function ParticipantView({ state, dispatch, currentUser }: ParticipantViewProps) {
  const [motionText, setMotionText] = useState("");
  const [selectedMotion, setSelectedMotion] = useState("mainMotion");
  const [showAgendaAmendForm, setShowAgendaAmendForm] = useState(false);
  const [showSuspendRulesForm, setShowSuspendRulesForm] = useState(false);
  const [showTakeFromTableForm, setShowTakeFromTableForm] = useState(false);
  const [showReconsiderForm, setShowReconsiderForm] = useState(false);

  // Memoize expensive computations
  const validMotions = useMemo(() => getValidMotions(state, currentUser.id), [state, currentUser.id]);
  const selectedMotionDef = MOTIONS[selectedMotion];
  const handRaised = useMemo(
    () => state.speakerQueue.find(s => s.member.id === currentUser.id),
    [state.speakerQueue, currentUser.id]
  );
  const hasFloor = state.recognizedSpeaker?.id === currentUser.id;

  // Memoize motion grouping by category
  const groupedMotions = useMemo(() => {
    return validMotions.reduce<Record<string, Array<MotionDefinition & { key: string }>>>((acc, m) => {
      if (!acc[m.category]) acc[m.category] = [];
      acc[m.category].push(m);
      return acc;
    }, {});
  }, [validMotions]);

  // Use custom hooks
  const voteResults = useVoteResults(state.meetingLog);
  const { presentCount, effectiveCount, hasQuorum } = useQuorumStatus(
    state.members,
    state.quorum,
    { proxiesCountForQuorum: state.proxiesCountForQuorum, proxies: state.proxies }
  );

  useEffect(() => {
    if (!validMotions.find(m => m.key === selectedMotion) && validMotions.length > 0) {
      setSelectedMotion(validMotions[0].key);
    }
  }, [validMotions, selectedMotion]);

  const handleMotionSubmit = useCallback(() => {
    if (selectedMotion === 'amendAgenda') {
      setShowAgendaAmendForm(true);
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
        timestamp: generateTimestamp()
      });
      setMotionText("");
    }
  }, [selectedMotion, motionText, selectedMotionDef, currentUser, dispatch]);

  const handleAgendaAmendSubmit = useCallback((text: string, agendaAmendment: AgendaAmendment) => {
    dispatch({
      type: 'MAKE_MOTION',
      motionType: 'amendAgenda',
      text,
      mover: currentUser.name,
      moverId: currentUser.id,
      agendaAmendment,
      motionId: generateId(),
      timestamp: generateTimestamp()
    });
    setShowAgendaAmendForm(false);
  }, [currentUser, dispatch]);

  const handleSuspendRulesSubmit = useCallback((
    purpose: string,
    specificAction: string,
    scope: 'single-action' | 'meeting-remainder',
    rule: SuspendableRule
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
      timestamp: generateTimestamp()
    });
    setShowSuspendRulesForm(false);
  }, [currentUser, dispatch]);

  const handleTakeFromTableSubmit = useCallback((text: string, tabledMotionId: number) => {
    dispatch({
      type: 'MAKE_MOTION',
      motionType: 'takeFromTable',
      text,
      mover: currentUser.name,
      moverId: currentUser.id,
      tabledMotionId,
      motionId: generateId(),
      timestamp: generateTimestamp()
    });
    setShowTakeFromTableForm(false);
  }, [currentUser, dispatch]);

  const handleReconsiderSubmit = useCallback((text: string, reconsideredMotionId: number) => {
    dispatch({
      type: 'MAKE_MOTION',
      motionType: 'reconsider',
      text,
      mover: currentUser.name,
      moverId: currentUser.id,
      reconsideredMotionId,
      motionId: generateId(),
      timestamp: generateTimestamp()
    });
    setShowReconsiderForm(false);
  }, [currentUser, dispatch]);

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
        <div className="bg-green-100 border-2 border-green-300 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-green-800 font-semibold text-lg">You have the floor</span>
            <button
              onClick={() => dispatch({ type: 'YIELD_FLOOR', timestamp: generateTimestamp() })}
              className="min-h-[40px] px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 touch-manipulation active:scale-[0.98] transition-transform focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2"
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
        <section className="bg-white rounded-lg p-4 shadow" aria-labelledby="agenda-heading">
          <h3 id="agenda-heading" className="font-semibold mb-3 text-gray-800">Agenda</h3>
          <ul className="space-y-2" role="list">
            {state.agenda.map((item, i) => (
              <li
                key={item.id}
                className={`flex items-center gap-2 p-2 rounded ${
                  item.status === 'completed' ? 'bg-green-50 text-gray-500' :
                  item.status === 'active' ? 'bg-indigo-100 font-medium' : ''
                }`}
              >
                {item.status === 'completed' && <CheckCircle size={16} className="text-green-600" aria-hidden="true" />}
                {item.status === 'active' && <ChevronRight size={16} className="text-indigo-600" aria-hidden="true" />}
                <span className={item.status === 'completed' ? 'line-through' : ''}>
                  {i + 1}. {item.title}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Make Motion Panel */}
      {!state.votingOpen && !state.pendingSecond && (state.agendaAdopted || state.agendaObjection) && (
        <section className="bg-white rounded-lg p-4 shadow" aria-labelledby="motion-heading">
          <h3 id="motion-heading" className="font-semibold mb-3 text-gray-800">Make a Motion</h3>
          {showAgendaAmendForm ? (
            <AgendaAmendmentForm
              agenda={state.agenda}
              onSubmit={handleAgendaAmendSubmit}
              onCancel={() => setShowAgendaAmendForm(false)}
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

      {/* Inquiries Panel */}
      <InquiryPanel state={state} dispatch={dispatch} currentUser={currentUser} isChair={false} />
    </div>
  );
}

// Sub-component for current business display
function CurrentBusinessPanel({
  state,
  dispatch,
  currentUser
}: {
  state: ParticipantViewProps['state'];
  dispatch: ParticipantViewProps['dispatch'];
  currentUser: ParticipantViewProps['currentUser'];
}) {
  return (
    <section className="bg-white rounded-lg p-4 shadow" aria-labelledby="current-business-heading">
      <h3 id="current-business-heading" className="font-semibold mb-3 flex items-center gap-2 text-gray-800">
        <MessageSquare size={18} aria-hidden="true" /> Current Business
      </h3>

      {state.currentAgendaItem && !state.currentMotion && !state.pendingSecond && (
        <div className="mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <p className="text-xs text-indigo-600 uppercase mb-1">Agenda Item</p>
          <p className="font-medium text-indigo-900">{state.currentAgendaItem.title}</p>
        </div>
      )}

      {state.meetingActive && !state.agendaAdopted && !state.agendaObjection && !state.pendingSecond && (
        <div className="space-y-3">
          <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
            <p className="text-blue-800 font-semibold mb-2 flex items-center gap-2">
              <Info size={18} aria-hidden="true" /> Agenda Adoption
            </p>
            <p className="text-gray-800 mb-2">
              The chair is asking: "Is there any objection to adopting the agenda?"
            </p>
            <p className="text-xs text-blue-700 bg-blue-100 p-2 rounded">
              If no one objects, the agenda will be adopted without a vote.
            </p>
          </div>
          <button
            onClick={() => dispatch({ type: 'AGENDA_OBJECTION', timestamp: generateTimestamp() })}
            className="w-full min-h-[56px] bg-amber-500 text-white py-4 rounded-xl hover:bg-amber-600 font-semibold text-lg touch-manipulation active:scale-[0.98] transition-transform focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
          >
            I Object to the Agenda!
          </button>
        </div>
      )}

      {state.meetingActive && !state.agendaAdopted && state.agendaObjection && !state.currentMotion && !state.pendingSecond && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-amber-800 font-medium mb-1">Objection to Agenda</p>
          <p className="text-amber-700 text-sm">A motion to adopt or amend the agenda is in order.</p>
        </div>
      )}

      {state.pendingSecond ? (
        <PendingSecondSection state={state} dispatch={dispatch} currentUser={currentUser} pendingSecond={state.pendingSecond} />
      ) : state.unanimousConsentPending ? (
        <UnanimousConsentSection state={state} dispatch={dispatch} currentUser={currentUser} />
      ) : state.currentMotion ? (
        <MotionCard motion={state.currentMotion} />
      ) : state.agendaAdopted && !state.currentAgendaItem ? (
        <div className="text-center py-6 text-gray-500">
          <Info size={24} className="mx-auto mb-2 opacity-50" aria-hidden="true" />
          <p>Waiting for Chair to call next item</p>
        </div>
      ) : !state.meetingActive ? (
        <div className="text-center py-6 text-gray-500">
          <Info size={24} className="mx-auto mb-2 opacity-50" aria-hidden="true" />
          <p>Meeting not started</p>
        </div>
      ) : null}
    </section>
  );
}

// Sub-component for pending second
function PendingSecondSection({
  state,
  dispatch,
  currentUser,
  pendingSecond
}: {
  state: ParticipantViewProps['state'];
  dispatch: ParticipantViewProps['dispatch'];
  currentUser: ParticipantViewProps['currentUser'];
  pendingSecond: NonNullable<ParticipantViewProps['state']['pendingSecond']>;
}) {
  return (
    <div className="space-y-3">
      {state.motionStack.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-gray-500 uppercase mb-1">Pending Question</p>
          <MotionCard motion={state.motionStack[state.motionStack.length - 1]} />
        </div>
      )}
      <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
        <p className="text-amber-800 font-semibold mb-2 flex items-center gap-2">
          <AlertCircle size={18} aria-hidden="true" /> Awaiting Second
        </p>
        <p className="text-gray-800">"{pendingSecond.text}"</p>
        <p className="text-sm text-gray-600 mt-1">
          {pendingSecond.name} by {pendingSecond.mover}
        </p>
      </div>
      {pendingSecond.mover === currentUser.name ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <p className="text-blue-800 font-medium mb-1">You moved this motion</p>
          <p className="text-blue-600 text-sm">
            Under Robert's Rules, you cannot second your own motion. Waiting for another member to second.
          </p>
        </div>
      ) : (
        <button
          onClick={() => dispatch({ type: 'SECOND_MOTION', seconder: currentUser.name, timestamp: generateTimestamp() })}
          className="w-full min-h-[56px] bg-amber-500 text-white py-4 rounded-xl hover:bg-amber-600 font-semibold text-lg touch-manipulation active:scale-[0.98] transition-transform focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
        >
          I Second This Motion
        </button>
      )}
    </div>
  );
}

// Sub-component for unanimous consent
function UnanimousConsentSection({
  state,
  dispatch,
  currentUser
}: {
  state: ParticipantViewProps['state'];
  dispatch: ParticipantViewProps['dispatch'];
  currentUser: ParticipantViewProps['currentUser'];
}) {
  return (
    <div className="space-y-3">
      <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
        <p className="text-green-800 font-semibold mb-2 flex items-center gap-2">
          <Info size={18} aria-hidden="true" /> Unanimous Consent Requested
        </p>
        <p className="text-gray-800 mb-2">"{state.currentMotion?.text}"</p>
        <p className="text-sm text-gray-600 mb-3">Chair is asking: "Is there any objection?"</p>
        <p className="text-xs text-green-700 bg-green-100 p-2 rounded">
          If no one objects, this motion will pass without a vote.
        </p>
      </div>
      <button
        onClick={() => dispatch({ type: 'OBJECT_TO_CONSENT', objector: currentUser.name, timestamp: generateTimestamp() })}
        className="w-full min-h-[56px] bg-red-500 text-white py-4 rounded-xl hover:bg-red-600 font-semibold text-lg touch-manipulation active:scale-[0.98] transition-transform focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
      >
        I Object!
      </button>
    </div>
  );
}

// Sub-component for motion selector
function MotionSelector({
  selectedMotion,
  setSelectedMotion,
  selectedMotionDef,
  motionText,
  setMotionText,
  groupedMotions,
  onSubmit
}: {
  selectedMotion: string;
  setSelectedMotion: (m: string) => void;
  selectedMotionDef: MotionDefinition | undefined;
  motionText: string;
  setMotionText: (t: string) => void;
  groupedMotions: Record<string, Array<MotionDefinition & { key: string }>>;
  onSubmit: () => void;
}) {
  const specialMotions = ['amendAgenda', 'suspendRules', 'takeFromTable', 'reconsider'];
  const isSpecialMotion = specialMotions.includes(selectedMotion);
  const needsText = !isSpecialMotion && !motionText.trim() && !selectedMotionDef?.phrase;

  return (
    <>
      <select
        value={selectedMotion}
        onChange={(e) => setSelectedMotion(e.target.value)}
        className="w-full min-h-[48px] p-3 border rounded-xl mb-3 bg-white text-base"
        aria-label="Select motion type"
      >
        {Object.entries(groupedMotions).map(([cat, motions]) => (
          <optgroup key={cat} label={`${CATEGORY_INFO[cat as keyof typeof CATEGORY_INFO].label} Motions`}>
            {motions.map((m) => (
              <option key={m.key} value={m.key}>{m.name}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {selectedMotionDef && (
        <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm">
          <div className="flex items-start gap-2">
            <HelpTooltip motion={selectedMotionDef} />
            <div>
              <p className="text-gray-700">{selectedMotionDef.help}</p>
              <p className="text-gray-500 italic mt-1">"{selectedMotionDef.phrase}"</p>
            </div>
          </div>
        </div>
      )}

      {!isSpecialMotion && (
        <div className="mb-3">
          <input
            type="text"
            placeholder={selectedMotionDef?.phrase || "I move that..."}
            value={motionText}
            onChange={(e) => setMotionText(e.target.value.slice(0, 500))}
            maxLength={500}
            className="w-full min-h-[48px] p-3 border rounded-xl text-base"
            aria-label="Motion text"
            aria-describedby="motion-char-count"
          />
          <div id="motion-char-count" className="text-xs text-gray-500 text-right mt-1">
            {motionText.length}/500
          </div>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={needsText}
        className="w-full min-h-[48px] bg-indigo-600 text-white py-3 rounded-xl hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium touch-manipulation active:scale-[0.98] transition-transform focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
      >
        {selectedMotion === 'amendAgenda' ? 'Configure Amendment...' :
         selectedMotion === 'suspendRules' ? 'Configure Suspension...' :
         selectedMotion === 'takeFromTable' ? 'Select Tabled Motion...' :
         selectedMotion === 'reconsider' ? 'Select Motion to Reconsider...' :
         'Submit Motion'}
      </button>
    </>
  );
}
