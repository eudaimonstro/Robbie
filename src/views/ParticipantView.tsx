import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Hand, ChevronRight, AlertCircle, Vote, MessageSquare, Info, CheckCircle } from 'lucide-react';
import { MOTIONS, CATEGORY_INFO } from '../constants/motions';
import { getValidMotions } from '../utils/motionHelpers';
import { generateId, generateTimestamp } from '../utils/idGenerators';
import { MotionCard } from '../components/MotionCard';
import { HelpTooltip } from '../components/HelpTooltip';
import { AgendaAmendmentForm } from '../components/AgendaAmendmentForm';
import { CountdownTimer } from '../components/CountdownTimer';
import { useVoteResults } from '../hooks/useVoteResults';
import type { ParticipantViewProps } from '../types';

export function ParticipantView({ state, dispatch, currentUser }: ParticipantViewProps) {
  const [motionText, setMotionText] = useState("");
  const [selectedMotion, setSelectedMotion] = useState("mainMotion");
  const [showAgendaAmendForm, setShowAgendaAmendForm] = useState(false);

  // Memoize expensive computations
  const validMotions = useMemo(() => getValidMotions(state), [state]);
  const selectedMotionDef = MOTIONS[selectedMotion];
  const handRaised = useMemo(() => state.speakerQueue.find(s => s.id === currentUser.id), [state.speakerQueue, currentUser.id]);
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

  const handleAgendaAmendSubmit = useCallback((text: string, agendaAmendment: any) => {
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

  return (
    <div className="space-y-4">
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
            {state.votingMethod === 'voice' && 'Voice Vote'}
            {state.votingMethod === 'rising' && 'Rising Vote'}
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

          {state.votingMethod === 'voice' && (
            <div className="bg-blue-50 p-4 rounded-lg text-center">
              <p className="text-blue-800 font-medium mb-2">Voice Vote in Progress</p>
              <p className="text-blue-700 text-sm">Chair will ask: "All in favor say Aye. All opposed say No."</p>
              <p className="text-blue-600 text-xs mt-2">Speak your vote aloud when prompted</p>
            </div>
          )}

          {state.votingMethod === 'rising' && (
            <div className="bg-purple-50 p-4 rounded-lg text-center">
              <p className="text-purple-800 font-medium mb-2">Rising Vote in Progress</p>
              <p className="text-purple-700 text-sm mb-3">Chair will ask: "All in favor, please rise. All opposed, please rise."</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'yea', voterId: currentUser.id })} disabled={state.voters.includes(currentUser.id)} className="bg-green-500 text-white py-3 rounded-lg font-bold disabled:opacity-50">I Rise in Favor</button>
                <button onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'nay', voterId: currentUser.id })} disabled={state.voters.includes(currentUser.id)} className="bg-red-500 text-white py-3 rounded-lg font-bold disabled:opacity-50">I Rise Opposed</button>
              </div>
            </div>
          )}

          {(state.votingMethod === 'standard' || state.votingMethod === 'ballot') && (
            <>
              {state.votingMethod === 'ballot' && (
                <p className="text-sm text-gray-600 mb-3 bg-gray-50 p-2 rounded">
                  🔒 Secret Ballot - your vote is anonymous
                </p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'yea', voterId: currentUser.id })} disabled={state.voters.includes(currentUser.id)} className="bg-green-500 text-white py-4 rounded-lg font-bold text-lg disabled:opacity-50">YEA</button>
                <button onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'nay', voterId: currentUser.id })} disabled={state.voters.includes(currentUser.id)} className="bg-red-500 text-white py-4 rounded-lg font-bold text-lg disabled:opacity-50">NAY</button>
                <button onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'abstain', voterId: currentUser.id })} disabled={state.voters.includes(currentUser.id)} className="bg-gray-400 text-white py-4 rounded-lg font-bold disabled:opacity-50">ABSTAIN</button>
              </div>
            </>
          )}

          {state.votingMethod === 'rollcall' && (
            <div className="bg-indigo-50 p-4 rounded-lg">
              <p className="text-indigo-800 font-medium mb-2">Roll Call Vote</p>
              <p className="text-indigo-700 text-sm mb-3">Chair will call each member by name. Respond when called.</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'yea', voterId: currentUser.id })} disabled={state.voters.includes(currentUser.id)} className="bg-green-500 text-white py-3 rounded-lg font-bold disabled:opacity-50">AYE</button>
                <button onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'nay', voterId: currentUser.id })} disabled={state.voters.includes(currentUser.id)} className="bg-red-500 text-white py-3 rounded-lg font-bold disabled:opacity-50">NO</button>
                <button onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'abstain', voterId: currentUser.id })} disabled={state.voters.includes(currentUser.id)} className="bg-gray-400 text-white py-3 rounded-lg disabled:opacity-50">ABSTAIN</button>
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
        <button onClick={() => dispatch({ type: handRaised ? 'LOWER_HAND' : 'RAISE_HAND', member: currentUser })} className={`w-full py-3 rounded-lg font-medium ${handRaised ? 'bg-amber-100 text-amber-700 border-2 border-amber-300' : 'bg-blue-500 text-white'}`}>
          {handRaised ? "✋ Hand Raised (tap to lower)" : "Raise Hand to Speak"}
        </button>
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
          ) : (
            <>
              <select value={selectedMotion} onChange={(e) => setSelectedMotion(e.target.value)} className="w-full p-3 border rounded-lg mb-3 bg-white">
                {Object.entries(validMotions.reduce((acc, m) => { if (!acc[m.category]) acc[m.category] = []; acc[m.category].push(m); return acc; }, {} as any)).map(([cat, motions]: [string, any]) => (
                  <optgroup key={cat} label={CATEGORY_INFO[cat].label + " Motions"}>
                    {motions.map((m: any) => <option key={m.key} value={m.key}>{m.name}</option>)}
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
              {selectedMotion !== 'amendAgenda' && (
                <input type="text" placeholder={selectedMotionDef?.phrase || "I move that..."} value={motionText} onChange={(e) => setMotionText(e.target.value)} className="w-full p-3 border rounded-lg mb-3"/>
              )}
              <button onClick={handleMotionSubmit} disabled={selectedMotion !== 'amendAgenda' && !motionText.trim() && !selectedMotionDef?.phrase} className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 font-medium">
                {selectedMotion === 'amendAgenda' ? 'Configure Amendment...' : 'Submit Motion'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
