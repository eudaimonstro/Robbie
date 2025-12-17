import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Hand, ChevronRight, AlertCircle, Vote, MessageSquare, Info, CheckCircle } from 'lucide-react';
import { MOTIONS, CATEGORY_INFO } from '../constants/motions';
import { getValidMotions } from '../utils/motionHelpers';
import { generateId, generateTimestamp } from '../utils/idGenerators';
import { MotionCard } from '../components/MotionCard';
import { HelpTooltip } from '../components/HelpTooltip';
import { AgendaAmendmentForm } from '../components/AgendaAmendmentForm';
import { SuspendRulesForm } from '../components/SuspendRulesForm';
import { ActiveSuspensionsBanner } from '../components/ActiveSuspensionsBanner';
import { CountdownTimer } from '../components/CountdownTimer';
import { useVoteResults } from '../hooks/useVoteResults';
import type { ParticipantViewProps, SuspendableRule, AgendaAmendment, MotionDefinition, CategoryInfo } from '../types';

export function ParticipantView({ state, dispatch, currentUser }: ParticipantViewProps) {
  const [motionText, setMotionText] = useState("");
  const [selectedMotion, setSelectedMotion] = useState("mainMotion");
  const [showAgendaAmendForm, setShowAgendaAmendForm] = useState(false);
  const [showSuspendRulesForm, setShowSuspendRulesForm] = useState(false);
  const [selectedStance, setSelectedStance] = useState<'pro' | 'con' | 'neutral'>('neutral');

  // Memoize expensive computations
  const validMotions = useMemo(() => getValidMotions(state), [state]);
  const selectedMotionDef = MOTIONS[selectedMotion];
  const handRaised = useMemo(() => state.speakerQueue.find(s => s.member.id === currentUser.id), [state.speakerQueue, currentUser.id]);
  const hasFloor = state.recognizedSpeaker?.id === currentUser.id;

  // Use custom hook for vote results
  const voteResults = useVoteResults(state.meetingLog);

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

  const handleSuspendRulesSubmit = useCallback((purpose: string, specificAction: string, scope: 'single-action' | 'meeting-remainder', rule: SuspendableRule) => {
    const text = `I move to suspend the rules (${rule}) for the following purpose: ${purpose}. Specific action: ${specificAction}`;
    dispatch({
      type: 'MAKE_MOTION',
      motionType: 'suspendRules',
      text,
      mover: currentUser.name,
      moverId: currentUser.id,
      ruleSuspension: {
        rule,
        purpose,
        specificAction,
        scope
      },
      motionId: generateId(),
      timestamp: generateTimestamp()
    });
    setShowSuspendRulesForm(false);
  }, [currentUser, dispatch]);

  return (
    <div className="space-y-4">
      <ActiveSuspensionsBanner state={state} currentUser={currentUser} dispatch={dispatch} />

      {hasFloor && (
        <div className="bg-green-100 border border-green-300 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-800 font-medium">You have the floor</span>
            <button onClick={() => dispatch({ type: 'YIELD_FLOOR', timestamp: generateTimestamp() })} className="text-green-700 text-sm underline">Yield</button>
          </div>
          {state.speakerTimerEnd && <CountdownTimer endTime={state.speakerTimerEnd} label="Time Remaining" />}
        </div>
      )}

      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><MessageSquare size={18}/> Current Business</h3>

        {state.currentAgendaItem && !state.currentMotion && !state.pendingSecond && (
          <div className="mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <p className="text-xs text-indigo-600 uppercase mb-1">Agenda Item</p>
            <p className="font-medium text-indigo-900">{state.currentAgendaItem.title}</p>
          </div>
        )}

        {state.meetingActive && !state.agendaAdopted && !state.agendaObjection && !state.pendingSecond && (
          <div className="space-y-3">
            <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
              <p className="text-blue-800 font-semibold mb-2 flex items-center gap-2"><Info size={18}/> Agenda Adoption</p>
              <p className="text-gray-800 mb-2">The chair is asking: "Is there any objection to adopting the agenda?"</p>
              <p className="text-xs text-blue-700 bg-blue-100 p-2 rounded">If no one objects, the agenda will be adopted without a vote.</p>
            </div>
            <button
              onClick={() => dispatch({ type: 'AGENDA_OBJECTION', timestamp: generateTimestamp() })}
              className="w-full bg-amber-500 text-white py-3 rounded-lg hover:bg-amber-600 font-semibold text-lg"
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
          <div className="space-y-3">
            {state.motionStack.length > 0 && (
              <div className="mb-2">
                <p className="text-xs text-gray-500 uppercase mb-1">Pending Question</p>
                <MotionCard motion={state.motionStack[state.motionStack.length - 1]}/>
              </div>
            )}
            <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
              <p className="text-amber-800 font-semibold mb-2 flex items-center gap-2"><AlertCircle size={18}/> Awaiting Second</p>
              <p className="text-gray-800">"{state.pendingSecond.text}"</p>
              <p className="text-sm text-gray-600 mt-1">{state.pendingSecond.name} by {state.pendingSecond.mover}</p>
            </div>
            {state.pendingSecond.mover === currentUser.name ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <p className="text-blue-800 font-medium mb-1">You moved this motion</p>
                <p className="text-blue-600 text-sm">Under Robert's Rules, you cannot second your own motion. Waiting for another member to second.</p>
              </div>
            ) : (
              <button
                onClick={() => dispatch({ type: 'SECOND_MOTION', seconder: currentUser.name, timestamp: generateTimestamp() })}
                className="w-full bg-amber-500 text-white py-3 rounded-lg hover:bg-amber-600 font-semibold text-lg"
              >
                I Second This Motion
              </button>
            )}
          </div>
        ) : state.unanimousConsentPending ? (
          <div className="space-y-3">
            <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
              <p className="text-green-800 font-semibold mb-2 flex items-center gap-2"><Info size={18}/> Unanimous Consent Requested</p>
              <p className="text-gray-800 mb-2">"{state.currentMotion?.text}"</p>
              <p className="text-sm text-gray-600 mb-3">Chair is asking: "Is there any objection?"</p>
              <p className="text-xs text-green-700 bg-green-100 p-2 rounded">If no one objects, this motion will pass without a vote.</p>
            </div>
            <button
              onClick={() => dispatch({ type: 'OBJECT_TO_CONSENT', objector: currentUser.name, timestamp: generateTimestamp() })}
              className="w-full bg-red-500 text-white py-3 rounded-lg hover:bg-red-600 font-semibold text-lg"
            >
              I Object!
            </button>
          </div>
        ) : state.currentMotion ? (
          <MotionCard motion={state.currentMotion}/>
        ) : state.agendaAdopted && !state.currentAgendaItem ? (
          <div className="text-center py-6 text-gray-500">
            <Info size={24} className="mx-auto mb-2 opacity-50"/>
            <p>Waiting for Chair to call next item</p>
          </div>
        ) : !state.meetingActive ? (
          <div className="text-center py-6 text-gray-500">
            <Info size={24} className="mx-auto mb-2 opacity-50"/>
            <p>Meeting not started</p>
          </div>
        ) : null}
      </div>

      {state.votingOpen && (
        <div className="bg-white rounded-lg p-4 shadow border-2 border-indigo-200">
          <h3 className="font-semibold mb-2 flex items-center gap-2 text-indigo-700">
            <Vote size={18}/>
            {state.votingMethod === 'standard' && 'Vote Now'}
            {state.votingMethod === 'ballot' && 'Secret Ballot'}
            {state.votingMethod === 'rollcall' && 'Roll Call Vote'}
          </h3>
          {state.voteTimerEnd && (
            <div className="mb-3">
              <CountdownTimer endTime={state.voteTimerEnd} label="Voting Time" />
            </div>
          )}
          <p className="text-gray-700 mb-2">"{state.currentMotion?.text}"</p>
          <p className="text-sm text-gray-500 mb-4">Requires: {state.currentMotion?.vote === "2/3" ? "Two-thirds" : "Majority"}</p>

          {(state.votingMethod === 'standard' || state.votingMethod === 'ballot') && (
            <>
              {state.votingMethod === 'ballot' && (
                <p className="text-sm text-gray-600 mb-3 bg-gray-50 p-2 rounded">
                  🔒 Secret Ballot - your vote is anonymous
                </p>
              )}
              {state.voterChoices[currentUser.id] && (
                <p className="text-xs text-blue-600 mb-2 text-center">
                  You may change your vote before the chair closes voting
                </p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'yea', voterId: currentUser.id })}
                  className={`py-4 rounded-lg font-bold text-lg transition-all ${
                    state.voterChoices[currentUser.id] === 'yea'
                      ? 'bg-green-600 text-white ring-4 ring-green-300'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  YEA{state.voterChoices[currentUser.id] === 'yea' ? ' ✓' : ''}
                </button>
                <button
                  onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'nay', voterId: currentUser.id })}
                  className={`py-4 rounded-lg font-bold text-lg transition-all ${
                    state.voterChoices[currentUser.id] === 'nay'
                      ? 'bg-red-600 text-white ring-4 ring-red-300'
                      : 'bg-red-500 text-white hover:bg-red-600'
                  }`}
                >
                  NAY{state.voterChoices[currentUser.id] === 'nay' ? ' ✓' : ''}
                </button>
                <button
                  onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'abstain', voterId: currentUser.id })}
                  className={`py-4 rounded-lg font-bold transition-all ${
                    state.voterChoices[currentUser.id] === 'abstain'
                      ? 'bg-gray-600 text-white ring-4 ring-gray-400'
                      : 'bg-gray-400 text-white hover:bg-gray-500'
                  }`}
                >
                  ABSTAIN{state.voterChoices[currentUser.id] === 'abstain' ? ' ✓' : ''}
                </button>
              </div>
            </>
          )}

          {state.votingMethod === 'rollcall' && (
            <div className="bg-indigo-50 p-4 rounded-lg">
              <p className="text-indigo-800 font-medium mb-2">Roll Call Vote</p>
              <p className="text-indigo-700 text-sm mb-3">Chair will call each member by name. Respond when called.</p>
              {state.voterChoices[currentUser.id] && (
                <p className="text-xs text-blue-600 mb-2 text-center">
                  You may change your vote before the chair closes voting
                </p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'yea', voterId: currentUser.id })}
                  className={`py-3 rounded-lg font-bold transition-all ${
                    state.voterChoices[currentUser.id] === 'yea'
                      ? 'bg-green-600 text-white ring-4 ring-green-300'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  AYE{state.voterChoices[currentUser.id] === 'yea' ? ' ✓' : ''}
                </button>
                <button
                  onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'nay', voterId: currentUser.id })}
                  className={`py-3 rounded-lg font-bold transition-all ${
                    state.voterChoices[currentUser.id] === 'nay'
                      ? 'bg-red-600 text-white ring-4 ring-red-300'
                      : 'bg-red-500 text-white hover:bg-red-600'
                  }`}
                >
                  NO{state.voterChoices[currentUser.id] === 'nay' ? ' ✓' : ''}
                </button>
                <button
                  onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'abstain', voterId: currentUser.id })}
                  className={`py-3 rounded-lg font-bold transition-all ${
                    state.voterChoices[currentUser.id] === 'abstain'
                      ? 'bg-gray-600 text-white ring-4 ring-gray-400'
                      : 'bg-gray-400 text-white hover:bg-gray-500'
                  }`}
                >
                  ABSTAIN{state.voterChoices[currentUser.id] === 'abstain' ? ' ✓' : ''}
                </button>
              </div>
            </div>
          )}

          {state.voters.includes(currentUser.id) && <p className="text-center text-green-600 mt-3 font-medium">✓ Vote recorded</p>}
        </div>
      )}

      {!state.votingOpen && voteResults && (
        <div className={`bg-white rounded-lg p-4 shadow border-2 ${voteResults.passed ? 'border-green-300' : 'border-red-300'}`}>
          <h3 className={`font-semibold mb-3 flex items-center gap-2 ${voteResults.passed ? 'text-green-700' : 'text-red-700'}`}>
            <Vote size={18}/>
            Vote Result: {voteResults.outcome}
          </h3>
          {voteResults.motionText && (
            <p className="text-gray-800 mb-3 italic">"{voteResults.motionText}"</p>
          )}
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div className={`${voteResults.passed ? 'bg-green-100' : 'bg-green-50'} p-3 rounded-lg text-center`}>
              <p className={`text-2xl font-bold ${voteResults.passed ? 'text-green-700' : 'text-green-600'}`}>{voteResults.yea}</p>
              <p className="text-green-600 text-sm">Yea</p>
            </div>
            <div className={`${!voteResults.passed ? 'bg-red-100' : 'bg-red-50'} p-3 rounded-lg text-center`}>
              <p className={`text-2xl font-bold ${!voteResults.passed ? 'text-red-700' : 'text-red-600'}`}>{voteResults.nay}</p>
              <p className="text-red-600 text-sm">Nay</p>
            </div>
          </div>
          <p className={`text-center text-sm ${voteResults.passed ? 'text-green-600' : 'text-red-600'}`}>
            {voteResults.timestamp}
          </p>
        </div>
      )}

      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><Hand size={18}/> Seek Recognition</h3>
        {handRaised ? (
          <div className="space-y-2">
            <div className="bg-amber-100 border-2 border-amber-300 rounded-lg p-3 text-center">
              <p className="font-medium text-amber-700">✋ Hand Raised</p>
              <p className="text-xs text-amber-600 mt-1">
                Stance: {handRaised.stance === 'pro' ? '✓ For' : handRaised.stance === 'con' ? '✗ Against' : '○ Neutral'}
              </p>
            </div>
            <button
              onClick={() => dispatch({ type: 'LOWER_HAND', member: currentUser })}
              className="w-full py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              Lower Hand
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800 mb-2 font-medium">Select your position on the motion:</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setSelectedStance('pro')}
                  className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
                    selectedStance === 'pro'
                      ? 'bg-green-600 text-white'
                      : 'bg-white text-green-700 border border-green-300 hover:bg-green-50'
                  }`}
                >
                  ✓ For
                </button>
                <button
                  onClick={() => setSelectedStance('con')}
                  className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
                    selectedStance === 'con'
                      ? 'bg-red-600 text-white'
                      : 'bg-white text-red-700 border border-red-300 hover:bg-red-50'
                  }`}
                >
                  ✗ Against
                </button>
                <button
                  onClick={() => setSelectedStance('neutral')}
                  className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
                    selectedStance === 'neutral'
                      ? 'bg-gray-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  ○ Neutral
                </button>
              </div>
            </div>
            <button
              onClick={() => dispatch({ type: 'RAISE_HAND', member: currentUser, stance: selectedStance })}
              className="w-full py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600"
            >
              Raise Hand to Speak
            </button>
            <p className="text-xs text-gray-500 text-center">
              Per Robert's Rules, speakers alternate between for and against
            </p>
          </div>
        )}
      </div>

      {state.agendaAdopted && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Agenda</h3>
          <ul className="space-y-2">
            {state.agenda.map((item, i) => (
              <li key={item.id} className={`flex items-center gap-2 p-2 rounded ${item.status === 'completed' ? 'bg-green-50 text-gray-500' : item.status === 'active' ? 'bg-indigo-100 font-medium' : ''}`}>
                {item.status === 'completed' && <CheckCircle size={16} className="text-green-600"/>}
                {item.status === 'active' && <ChevronRight size={16} className="text-indigo-600"/>}
                <span className={item.status === 'completed' ? 'line-through' : ''}>{i + 1}. {item.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!state.votingOpen && !state.pendingSecond && (state.agendaAdopted || state.agendaObjection) && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Make a Motion</h3>
          {showAgendaAmendForm ? (
            <AgendaAmendmentForm agenda={state.agenda} onSubmit={handleAgendaAmendSubmit} onCancel={() => setShowAgendaAmendForm(false)}/>
          ) : showSuspendRulesForm ? (
            <SuspendRulesForm onSubmit={handleSuspendRulesSubmit} onCancel={() => setShowSuspendRulesForm(false)}/>
          ) : (
            <>
              <select value={selectedMotion} onChange={(e) => setSelectedMotion(e.target.value)} className="w-full p-3 border rounded-lg mb-3 bg-white">
                {Object.entries(
                  validMotions.reduce<Record<string, Array<MotionDefinition & { key: string }>>>((acc, m) => {
                    if (!acc[m.category]) acc[m.category] = [];
                    acc[m.category].push(m);
                    return acc;
                  }, {})
                ).map(([cat, motions]) => (
                  <optgroup key={cat} label={CATEGORY_INFO[cat as keyof typeof CATEGORY_INFO].label + " Motions"}>
                    {motions.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
                  </optgroup>
                ))}
              </select>
              {selectedMotionDef && (
                <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm">
                  <div className="flex items-start gap-2">
                    <HelpTooltip motion={selectedMotionDef}/>
                    <div>
                      <p className="text-gray-700">{selectedMotionDef.help}</p>
                      <p className="text-gray-500 italic mt-1">"{selectedMotionDef.phrase}"</p>
                    </div>
                  </div>
                </div>
              )}
              {selectedMotion !== 'amendAgenda' && selectedMotion !== 'suspendRules' && (
                <input type="text" placeholder={selectedMotionDef?.phrase || "I move that..."} value={motionText} onChange={(e) => setMotionText(e.target.value)} className="w-full p-3 border rounded-lg mb-3"/>
              )}
              <button onClick={handleMotionSubmit} disabled={selectedMotion !== 'amendAgenda' && selectedMotion !== 'suspendRules' && !motionText.trim() && !selectedMotionDef?.phrase} className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 font-medium">
                {selectedMotion === 'amendAgenda' ? 'Configure Amendment...' : selectedMotion === 'suspendRules' ? 'Configure Suspension...' : 'Submit Motion'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
