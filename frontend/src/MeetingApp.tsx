import { useState, useEffect, useMemo } from 'react';
import { Users, Gavel, Settings, AlertCircle } from 'lucide-react';
import { useSocket } from './context/SocketContext';
import { ParticipantView } from './views/ParticipantView';
import { ChairView } from './views/ChairView';
import { AdminView } from './views/AdminView';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ErrorBoundary } from './components/ErrorBoundary';

type ViewType = 'participant' | 'chair' | 'admin';

export function MeetingApp() {
  const { state, dispatch, currentUser } = useSocket();
  const [view, setView] = useState<ViewType>("participant");

  // Use authenticated user, falling back to first member for compatibility
  const activeUser = currentUser || state.members[0];

  // Determine the allowed view based on user role
  const allowedView = useMemo((): ViewType => {
    if (!activeUser) return 'participant';
    switch (activeUser.role) {
      case 'admin':
        return view; // Admins can use any view they've selected
      case 'chair':
        return 'chair'; // Chairs are locked to chair view
      case 'member':
      default:
        return 'participant'; // Members are locked to participant view
    }
  }, [activeUser, view]);

  // Check if user can switch views (only admins)
  const canSwitchViews = activeUser?.role === 'admin';

  // Set initial view based on role when user changes
  useEffect(() => {
    if (!activeUser) return;
    if (activeUser.role === 'chair') {
      setView('chair');
    } else if (activeUser.role === 'member') {
      setView('participant');
    }
    // Admins keep their current view selection
  }, [activeUser?.id, activeUser?.role]);

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
            <p className="text-indigo-200 text-sm">
              Meeting: {state.meetingCode || 'Not Connected'}
            </p>
          </div>
        </div>
      </header>

      <ConnectionStatus />

      <div className="p-4 max-w-lg mx-auto">
        {/* View switcher - only visible to admins */}
        {canSwitchViews && (
          <nav
            className="flex gap-1 mb-4 bg-white rounded-xl p-1 shadow"
            role="tablist"
            aria-label="Meeting view selection"
          >
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id as ViewType)}
                role="tab"
                aria-selected={view === tab.id}
                aria-controls={`${tab.id}-panel`}
                id={`${tab.id}-tab`}
                className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 ${
                  view === tab.id
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <tab.icon size={18} aria-hidden="true" />
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        {/* Role indicator for non-admin users */}
        {!canSwitchViews && (
          <div className="mb-4 bg-white rounded-lg p-3 shadow">
            <div className="flex items-center gap-3">
              <span className="text-gray-600">View:</span>
              <span className="font-medium text-indigo-700 capitalize flex items-center gap-2">
                {allowedView === 'chair' ? (
                  <><Gavel size={16} /> Chair Dashboard</>
                ) : (
                  <><Users size={16} /> Member View</>
                )}
              </span>
            </div>
          </div>
        )}

        {allowedView === "participant" && (
          <div className="mb-4 bg-white rounded-lg p-3 shadow">
            <div className="flex items-center gap-3">
              <span className="text-gray-600">Logged in as:</span>
              <span className="font-medium text-indigo-700">{activeUser.name}</span>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded capitalize">
                {activeUser.role}
              </span>
            </div>
          </div>
        )}

        {!state.meetingActive && allowedView !== "chair" && (
          <div
            className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-center"
            role="status"
            aria-live="polite"
          >
            <AlertCircle size={24} className="mx-auto mb-2 text-amber-500" aria-hidden="true" />
            <p className="text-amber-800 font-medium">Meeting not started</p>
            <p className="text-amber-600 text-sm">Waiting for Chair</p>
          </div>
        )}

        <ErrorBoundary>
          {allowedView === "participant" && <ParticipantView state={state} dispatch={dispatch} currentUser={activeUser}/>}
          {allowedView === "chair" && <ChairView state={state} dispatch={dispatch}/>}
          {allowedView === "admin" && <AdminView state={state} dispatch={dispatch}/>}
        </ErrorBoundary>
      </div>
    </div>
  );
}
