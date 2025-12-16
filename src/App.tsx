import React, { useState, useReducer, useEffect } from 'react';
import { Users, Gavel, Settings, Hand, X, ChevronRight, AlertCircle, Vote, MessageSquare, Info, CheckCircle, Timer } from 'lucide-react';
import { MOTIONS, CATEGORY_INFO } from './constants/motions';
import { initialState } from './reducer/initialState';
import { meetingReducer } from './reducer/meetingReducer';
import { getValidMotions } from './utils/motionHelpers';
import { MotionCard } from './components/MotionCard';
import { HelpTooltip } from './components/HelpTooltip';
import { DraggableAgendaList } from './components/DraggableAgendaList';
import { AgendaAmendmentForm } from './components/AgendaAmendmentForm';
import { CountdownTimer } from './components/CountdownTimer';

function ParticipantView({ state, dispatch, currentUser }) {
  const [motionText, setMotionText] = useState("");
  const [selectedMotion, setSelectedMotion] = useState("mainMotion");
  const [showAgendaAmendForm, setShowAgendaAmendForm] = useState(false);
  const validMotions = getValidMotions(state);
  const selectedMotionDef = MOTIONS[selectedMotion];
  const handRaised = state.speakerQueue.find(s => s.id === currentUser.id);
  const hasFloor = state.recognizedSpeaker?.id === currentUser.id;

  useEffect(() => {
    if (!validMotions.find(m => m.key === selectedMotion) && validMotions.length > 0) {
      setSelectedMotion(validMotions[0].key);
    }
  }, [validMotions, selectedMotion]);

  const handleMotionSubmit = () => {
    if (selectedMotion === 'amendAgenda') {
      setShowAgendaAmendForm(true);
    } else {
      dispatch({ type: 'MAKE_MOTION', motionType: selectedMotion, text: motionText || selectedMotionDef?.phrase, mover: currentUser.name });
      setMotionText("");
    }
  };

  const handleAgendaAmendSubmit = (text, agendaAmendment) => {
    dispatch({ type: 'MAKE_MOTION', motionType: 'amendAgenda', text, mover: currentUser.name, agendaAmendment });
    setShowAgendaAmendForm(false);
  };

  return (
    <div className="space-y-4">
      {hasFloor && (
        <div className="bg-green-100 border border-green-300 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-800 font-medium">You have the floor</span>
            <button onClick={() => dispatch({ type: 'YIELD_FLOOR' })} className="text-green-700 text-sm underline">Yield</button>
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
          <div className="text-center py-6 text-gray-500">
            <Info size={24} className="mx-auto mb-2 opacity-50"/>
            <p>Waiting for agenda adoption</p>
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
            {state.pendingSecond.mover !== currentUser.name && (
              <button onClick={() => dispatch({ type: 'SECOND_MOTION', seconder: currentUser.name })} className="w-full bg-amber-500 text-white py-3 rounded-lg hover:bg-amber-600 font-semibold text-lg">I Second This Motion</button>
            )}
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
          <h3 className="font-semibold mb-2 flex items-center gap-2 text-indigo-700"><Vote size={18}/> Vote Now</h3>
          {state.voteTimerEnd && (
            <div className="mb-3">
              <CountdownTimer endTime={state.voteTimerEnd} label="Voting Time" />
            </div>
          )}
          <p className="text-gray-700 mb-2">"{state.currentMotion?.text}"</p>
          <p className="text-sm text-gray-500 mb-4">Requires: {state.currentMotion?.vote === "2/3" ? "Two-thirds" : "Majority"}</p>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'yea', oderId: currentUser.id })} disabled={state.voters.includes(currentUser.id)} className="bg-green-500 text-white py-4 rounded-lg font-bold text-lg disabled:opacity-50">YEA</button>
            <button onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'nay', oderId: currentUser.id })} disabled={state.voters.includes(currentUser.id)} className="bg-red-500 text-white py-4 rounded-lg font-bold text-lg disabled:opacity-50">NAY</button>
            <button onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'abstain', oderId: currentUser.id })} disabled={state.voters.includes(currentUser.id)} className="bg-gray-400 text-white py-4 rounded-lg font-bold disabled:opacity-50">ABSTAIN</button>
          </div>
          {state.voters.includes(currentUser.id) && <p className="text-center text-green-600 mt-3 font-medium">Vote recorded</p>}
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
                {Object.entries(validMotions.reduce((acc, m) => { if (!acc[m.category]) acc[m.category] = []; acc[m.category].push(m); return acc; }, {})).map(([cat, motions]) => (
                  <optgroup key={cat} label={CATEGORY_INFO[cat].label + " Motions"}>
                    {motions.map(m => <option key={m.key} value={m.key}>{m.name}</option>)}
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

function ChairView({ state, dispatch }) {
  const [showScript, setShowScript] = useState(true);
  const [newAgendaItem, setNewAgendaItem] = useState("");

  const getChairScript = () => {
    if (!state.meetingActive) return null;
    if (!state.agendaAdopted && !state.agendaObjection && !state.currentMotion && !state.pendingSecond) return { text: '"Is there any objection to adopting the agenda?"', note: "If none, click 'No Objection'. If someone objects, click 'Objection Raised'." };
    if (!state.agendaAdopted && state.agendaObjection && !state.currentMotion && !state.pendingSecond) return { text: '"There has been an objection. A motion to adopt the agenda is in order."', note: "Wait for a member to move." };
    if (state.pendingSecond) return { text: '"Is there a second?"', note: "Wait for a second or declare no second." };
    if (state.votingOpen) return { text: '"Those in favor say Aye. Those opposed say No."', note: "Close voting when done." };
    if (state.currentMotion) return { text: state.currentMotion.debatable ? `"Is there any discussion on: ${state.currentMotion.text}?"` : '"This motion is not debatable."', note: state.currentMotion.debatable ? "Recognize speakers, then call the question." : "Proceed to vote." };
    if (state.currentAgendaItem) return { text: `"We are now on: ${state.currentAgendaItem.title}"`, note: "Allow discussion or motions." };
    if (state.agendaAdopted) {
      const next = state.agenda.find(a => a.status === "pending");
      return next ? { text: '"We will proceed to the next item."', note: `Next: "${next.title}"` } : { text: '"Is there any new business?"', note: "If none, entertain motion to adjourn." };
    }
    return { text: '"Is there any business?"', note: "" };
  };

  const script = getChairScript();

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><Gavel size={18}/> Meeting Control</h3>
        {!state.meetingActive ? (
          <button onClick={() => dispatch({ type: 'START_MEETING' })} className="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 font-medium">Call Meeting to Order</button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <span className="text-green-700 font-medium">Meeting in Progress</span>
              <span className="text-green-600 font-mono">{state.meetingCode}</span>
            </div>
            <button onClick={() => dispatch({ type: 'END_MEETING' })} className="w-full bg-red-500 text-white py-2 rounded-lg hover:bg-red-600">Adjourn</button>
          </div>
        )}
      </div>

      {script && showScript && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <div className="flex justify-between">
            <div>
              <p className="text-indigo-800 font-medium mb-1">Say:</p>
              <p className="text-indigo-900 text-lg">{script.text}</p>
              <p className="text-indigo-600 text-sm mt-2 italic">{script.note}</p>
            </div>
            <button onClick={() => setShowScript(false)} className="text-indigo-400"><X size={18}/></button>
          </div>
        </div>
      )}
      {!showScript && <button onClick={() => setShowScript(true)} className="text-indigo-600 text-sm">Show script</button>}

      {state.meetingActive && !state.agendaAdopted && !state.currentMotion && !state.pendingSecond && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">{state.agendaObjection ? "Agenda (Objection)" : "Adopt Agenda"}</h3>
          <p className="text-sm text-gray-600 mb-3">Drag items to reorder before adoption.</p>
          <DraggableAgendaList agenda={state.agenda} dispatch={dispatch} disabled={false}/>
          <div className="flex gap-2 my-3">
            <input type="text" value={newAgendaItem} onChange={(e) => setNewAgendaItem(e.target.value)} placeholder="Add item..." className="flex-1 p-2 border rounded-lg text-sm"/>
            <button onClick={() => { dispatch({ type: 'ADD_AGENDA_ITEM', title: newAgendaItem }); setNewAgendaItem(""); }} disabled={!newAgendaItem.trim()} className="bg-gray-200 text-gray-700 px-4 rounded-lg disabled:opacity-50 text-sm">Add</button>
          </div>
          {!state.agendaObjection ? (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => dispatch({ type: 'ADOPT_AGENDA' })} className="bg-green-500 text-white py-3 rounded-lg font-medium">No Objection</button>
              <button onClick={() => dispatch({ type: 'AGENDA_OBJECTION' })} className="bg-amber-500 text-white py-3 rounded-lg font-medium">Objection Raised</button>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
              <strong>Objection noted.</strong> A member must move to adopt or amend the agenda.
            </div>
          )}
        </div>
      )}

      {state.pendingSecond && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-2 text-amber-700">Awaiting Second</h3>
          <MotionCard motion={state.pendingSecond}/>
          <button onClick={() => dispatch({ type: 'DECLINE_SECOND' })} className="mt-3 w-full bg-gray-200 text-gray-700 py-2 rounded-lg">Declare "No Second"</button>
        </div>
      )}

      {state.currentMotion && !state.votingOpen && !state.pendingSecond && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Pending Motion</h3>
          <MotionCard motion={state.currentMotion}/>
          <button onClick={() => dispatch({ type: 'OPEN_VOTING' })} className="mt-4 w-full bg-indigo-600 text-white py-3 rounded-lg font-medium">Call the Question</button>
        </div>
      )}

      {state.votingOpen && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Voting</h3>
          {state.voteTimerEnd && (
            <div className="mb-3">
              <CountdownTimer endTime={state.voteTimerEnd} label="Voting Time" />
            </div>
          )}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-green-100 p-4 rounded-lg text-center"><p className="text-3xl font-bold text-green-700">{state.votes.yea}</p><p className="text-green-600">Yea</p></div>
            <div className="bg-red-100 p-4 rounded-lg text-center"><p className="text-3xl font-bold text-red-700">{state.votes.nay}</p><p className="text-red-600">Nay</p></div>
            <div className="bg-gray-100 p-4 rounded-lg text-center"><p className="text-3xl font-bold text-gray-700">{state.votes.abstain}</p><p className="text-gray-600">Abstain</p></div>
          </div>
          <button onClick={() => dispatch({ type: 'CLOSE_VOTING' })} className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium">Close & Announce</button>
        </div>
      )}

      {state.agendaAdopted && state.currentAgendaItem && !state.currentMotion && !state.pendingSecond && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-2 text-gray-800">Current Item</h3>
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-3 font-medium text-indigo-900">{state.currentAgendaItem.title}</div>
          <button onClick={() => dispatch({ type: 'COMPLETE_AGENDA_ITEM', id: state.currentAgendaItem.id })} className="w-full bg-green-500 text-white py-2 rounded-lg">Mark Complete</button>
        </div>
      )}

      {state.agendaAdopted && !state.currentAgendaItem && !state.currentMotion && !state.pendingSecond && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Agenda</h3>
          <ul className="space-y-2">
            {state.agenda.map((item, i) => (
              <li key={item.id} className={`flex items-center justify-between p-3 rounded-lg ${item.status === 'completed' ? 'bg-green-50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                  {item.status === 'completed' && <CheckCircle size={16} className="text-green-600"/>}
                  <span className={item.status === 'completed' ? 'line-through text-gray-400' : ''}>{i + 1}. {item.title}</span>
                </div>
                {item.status === 'pending' && <button onClick={() => dispatch({ type: 'CALL_AGENDA_ITEM', id: item.id })} className="bg-indigo-500 text-white px-3 py-1 rounded text-sm">Call</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><Hand size={18}/> Speaker Queue <span className="bg-gray-200 text-gray-700 text-sm px-2 py-0.5 rounded-full">{state.speakerQueue.length}</span></h3>
        {state.recognizedSpeaker && (
          <div className="mb-3 p-3 bg-green-100 rounded-lg">
            <div className="text-green-800 font-medium mb-2"><strong>{state.recognizedSpeaker.name}</strong> has the floor</div>
            {state.speakerTimerEnd && <CountdownTimer endTime={state.speakerTimerEnd} label="Speaking Time" />}
          </div>
        )}
        {state.speakerQueue.length === 0 ? <p className="text-gray-500 text-center py-4">No one waiting</p> : (
          <ul className="space-y-2">
            {state.speakerQueue.map((m, i) => (
              <li key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span>{i + 1}. {m.name}</span>
                <button onClick={() => dispatch({ type: 'RECOGNIZE_SPEAKER', member: m })} className="bg-blue-500 text-white px-4 py-1 rounded text-sm">Recognize</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {state.motionStack.length > 0 && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Motion Stack</h3>
          <ul className="space-y-2">
            {[...state.motionStack].reverse().map((m, i) => (
              <li key={m.id} className={`text-sm p-3 rounded-lg ${i === 0 ? 'bg-indigo-100 border-2 border-indigo-300' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2">{i === 0 && <ChevronRight size={16} className="text-indigo-600"/>}<span className="font-medium">{m.name}</span></div>
                <p className="text-gray-600 ml-6">"{m.text}"</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AdminView({ state, dispatch }) {
  const [newItem, setNewItem] = useState("");
  const [speakerTime, setSpeakerTime] = useState(state.speakerTimeLimit);
  const [voteTime, setVoteTime] = useState(state.voteTimeLimit);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><Timer size={18}/> Time Limits</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Speaker Time Limit (seconds)</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={speakerTime}
                onChange={(e) => setSpeakerTime(parseInt(e.target.value) || 0)}
                className="flex-1 p-2 border rounded-lg"
              />
              <button
                onClick={() => dispatch({ type: 'SET_SPEAKER_TIME_LIMIT', seconds: speakerTime })}
                className="bg-indigo-600 text-white px-4 rounded-lg text-sm"
              >
                Set
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Set to 0 to disable timer</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vote Time Limit (seconds)</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={voteTime}
                onChange={(e) => setVoteTime(parseInt(e.target.value) || 0)}
                className="flex-1 p-2 border rounded-lg"
              />
              <button
                onClick={() => dispatch({ type: 'SET_VOTE_TIME_LIMIT', seconds: voteTime })}
                className="bg-indigo-600 text-white px-4 rounded-lg text-sm"
              >
                Set
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Set to 0 to disable timer</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><Settings size={18}/> Meeting Settings</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg"><p className="text-gray-500 text-sm">Quorum</p><p className="font-semibold text-lg">{state.quorum}</p></div>
          <div className="p-3 bg-gray-50 rounded-lg"><p className="text-gray-500 text-sm">Present</p><p className="font-semibold text-lg">{state.members.filter(m => m.present).length} / {state.members.length}</p></div>
        </div>
        <div className={`mt-3 p-3 rounded-lg ${state.members.filter(m => m.present).length >= state.quorum ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {state.members.filter(m => m.present).length >= state.quorum ? '✓ Quorum present' : '✗ No quorum'}
        </div>
      </div>

      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><Users size={18}/> Members</h3>
        <ul className="space-y-2">
          {state.members.map(m => (
            <li key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="font-medium">{m.name}</span>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${m.role === 'chair' ? 'bg-purple-100 text-purple-800' : m.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-700'}`}>{m.role}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 text-gray-800">Agenda {!state.agendaAdopted && "(Pending)"}</h3>
        {!state.agendaAdopted && <p className="text-sm text-amber-600 mb-3">Drag to reorder before adoption.</p>}
        <DraggableAgendaList agenda={state.agenda} dispatch={dispatch} disabled={state.agendaAdopted} showStatus={state.agendaAdopted}/>
        {!state.agendaAdopted && (
          <div className="flex gap-2 mt-3">
            <input type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="New item" className="flex-1 p-3 border rounded-lg"/>
            <button onClick={() => { dispatch({ type: 'ADD_AGENDA_ITEM', title: newItem }); setNewItem(""); }} disabled={!newItem.trim()} className="bg-indigo-600 text-white px-6 rounded-lg disabled:bg-gray-300">Add</button>
          </div>
        )}
        {state.agendaAdopted && <p className="text-xs text-gray-500 mt-3">Adopted. Changes require a motion.</p>}
      </div>

      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 text-gray-800">Meeting Log</h3>
        <div className="max-h-64 overflow-y-auto bg-gray-50 rounded-lg p-3">
          {state.meetingLog.length === 0 ? <p className="text-gray-500 text-center py-4">Not started</p> : (
            <ul className="space-y-1 text-sm font-mono">
              {state.meetingLog.map((e, i) => <li key={i} className="text-gray-700"><span className="text-gray-400">[{e.time}]</span> {e.message}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(meetingReducer, initialState);
  const [view, setView] = useState("participant");
  const [currentUser, setCurrentUser] = useState(initialState.members[0]);

  const tabs = [{ id: "participant", label: "Member", icon: Users }, { id: "chair", label: "Chair", icon: Gavel }, { id: "admin", label: "Admin", icon: Settings }];

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gradient-to-r from-indigo-700 to-indigo-800 text-white p-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg"><Gavel size={24}/></div>
          <div><h1 className="text-xl font-bold">Parliamentary Procedure</h1><p className="text-indigo-200 text-sm">Robert's Rules of Order</p></div>
        </div>
      </header>

      <div className="p-4 max-w-lg mx-auto">
        <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 shadow">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setView(tab.id)} className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 ${view === tab.id ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
              <tab.icon size={18}/>{tab.label}
            </button>
          ))}
        </div>

        {view === "participant" && (
          <div className="mb-4 bg-white rounded-lg p-3 shadow flex items-center gap-3">
            <span className="text-gray-600">Acting as:</span>
            <select value={currentUser.id} onChange={(e) => setCurrentUser(state.members.find(m => m.id === parseInt(e.target.value)))} className="flex-1 p-2 border rounded-lg bg-white">
              {state.members.filter(m => m.role === 'member').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}

        {!state.meetingActive && view !== "chair" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-center">
            <AlertCircle size={24} className="mx-auto mb-2 text-amber-500"/>
            <p className="text-amber-800 font-medium">Meeting not started</p>
            <p className="text-amber-600 text-sm">Waiting for Chair</p>
          </div>
        )}

        {view === "participant" && <ParticipantView state={state} dispatch={dispatch} currentUser={currentUser}/>}
        {view === "chair" && <ChairView state={state} dispatch={dispatch}/>}
        {view === "admin" && <AdminView state={state} dispatch={dispatch}/>}
      </div>
    </div>
  );
}
