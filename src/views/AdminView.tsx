import React, { useState } from 'react';
import { Users, Settings, Timer } from 'lucide-react';
import { generateId } from '../utils/idGenerators';
import { DraggableAgendaList } from '../components/DraggableAgendaList';
import type { AdminViewProps } from '../types';

export function AdminView({ state, dispatch }: AdminViewProps) {
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
            <button
              onClick={() => { dispatch({ type: 'ADD_AGENDA_ITEM', title: newItem, itemId: generateId() }); setNewItem(""); }}
              disabled={!newItem.trim()}
              className="bg-indigo-600 text-white px-6 rounded-lg disabled:bg-gray-300"
            >
              Add
            </button>
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
