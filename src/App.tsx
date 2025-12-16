import React, { useState, useReducer } from 'react';
import { Users, Gavel, Settings, AlertCircle } from 'lucide-react';
import { initialState } from './reducer/initialState';
import { meetingReducer } from './reducer/meetingReducer';
import { ParticipantView } from './views/ParticipantView';
import { ChairView } from './views/ChairView';
import { AdminView } from './views/AdminView';

export default function App() {
  const [state, dispatch] = useReducer(meetingReducer, initialState);
  const [view, setView] = useState("participant");
  const [currentUser, setCurrentUser] = useState(initialState.members[0]);

  const tabs = [
    { id: "participant", label: "Member", icon: Users },
    { id: "chair", label: "Chair", icon: Gavel },
    { id: "admin", label: "Admin", icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gradient-to-r from-indigo-700 to-indigo-800 text-white p-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg">
            <Gavel size={24}/>
          </div>
          <div>
            <h1 className="text-xl font-bold">Parliamentary Procedure</h1>
            <p className="text-indigo-200 text-sm">Robert's Rules of Order</p>
          </div>
        </div>
      </header>

      <div className="p-4 max-w-lg mx-auto">
        <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 shadow">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 ${
                view === tab.id
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <tab.icon size={18}/>
              {tab.label}
            </button>
          ))}
        </div>

        {view === "participant" && (
          <div className="mb-4 bg-white rounded-lg p-3 shadow flex items-center gap-3">
            <span className="text-gray-600">Acting as:</span>
            <select
              value={currentUser.id}
              onChange={(e) => setCurrentUser(state.members.find(m => m.id === parseInt(e.target.value))!)}
              className="flex-1 p-2 border rounded-lg bg-white"
            >
              {state.members.filter(m => m.role === 'member').map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
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
