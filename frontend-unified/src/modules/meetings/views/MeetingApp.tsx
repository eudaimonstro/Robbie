import { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, Gavel, Settings, AlertCircle, Crown, Clock, Pencil, X } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import { ParticipantView } from './ParticipantView';
import { ChairView } from './ChairView';
import { AdminView } from './AdminView';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { TestRoleSwitcher } from '../components/TestRoleSwitcher';

type ViewType = 'participant' | 'chair' | 'admin';

export function MeetingApp() {
  const { state, dispatch, currentUser, currentUserEmail } = useSocket();
  const [view, setView] = useState<ViewType>("participant");
  const [isRenamingName, setIsRenamingName] = useState(false);
  const [newName, setNewName] = useState('');

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

  const openRenameModal = useCallback(() => {
    if (activeUser) {
      setNewName(activeUser.name);
      setIsRenamingName(true);
    }
  }, [activeUser]);

  const handleSelfRename = useCallback(() => {
    const trimmedName = newName.trim();
    if (!activeUser || !trimmedName || trimmedName.length < 2 || trimmedName === activeUser.name) {
      setIsRenamingName(false);
      return;
    }

    dispatch({
      type: 'RENAME_MEMBER',
      memberId: activeUser.id,
      newName: trimmedName,
      renamedBy: activeUser.id,
      timestamp: generateTimestamp()
    });
    setIsRenamingName(false);
  }, [activeUser, newName, dispatch]);

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

      <div className="p-4 sm:p-6 lg:p-8 max-w-full sm:max-w-xl md:max-w-2xl lg:max-w-4xl xl:max-w-6xl mx-auto">
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
                className={`flex-1 min-h-[48px] py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 touch-manipulation active:scale-[0.98] transition-transform ${
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
              {activeUser.selfRenameUsed ? (
                <span
                  className="p-1 text-gray-300 cursor-not-allowed"
                  title="You've already changed your name once. Ask the chair if you need another change."
                >
                  <Pencil size={14} />
                </span>
              ) : (
                <button
                  onClick={openRenameModal}
                  className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                  title="Change your name (one-time only)"
                  aria-label="Change your display name"
                >
                  <Pencil size={14} />
                </button>
              )}
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded capitalize">
                {activeUser.role}
              </span>
            </div>
          </div>
        )}

        {/* Pre-meeting lobby for non-chair users */}
        {!state.meetingActive && allowedView !== "chair" && (
          <div className="bg-white rounded-lg p-6 mb-4 shadow" role="status" aria-live="polite">
            <div className="text-center mb-6">
              <Clock size={32} className="mx-auto mb-3 text-indigo-500" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-gray-800">Pre-Meeting Lobby</h2>
              <p className="text-gray-600 mt-1">The meeting has not started yet</p>
            </div>

            {/* Chair status */}
            {(() => {
              const chair = state.members.find(m => m.role === 'chair');
              return chair ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-center gap-2">
                    <Crown className="text-green-600" size={18} />
                    <span className="font-medium text-green-800">Chair: {chair.name}</span>
                  </div>
                  <p className="text-center text-green-700 text-sm mt-2">
                    Waiting for the chair to call the meeting to order
                  </p>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-center gap-2">
                    <AlertCircle className="text-amber-600" size={18} />
                    <span className="font-medium text-amber-800">No Chair Appointed</span>
                  </div>
                  <p className="text-center text-amber-700 text-sm mt-2">
                    Waiting for an admin to appoint a chair
                  </p>
                </div>
              );
            })()}

            {/* Members list */}
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Users size={16} />
                Members Joined ({state.members.filter(m => m.present).length})
              </h3>
              {state.members.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {state.members
                    .filter(m => m.present)
                    .map(m => (
                      <span
                        key={m.id}
                        className={`px-3 py-1 rounded-full text-sm ${
                          m.role === 'chair'
                            ? 'bg-purple-100 text-purple-800'
                            : m.role === 'admin'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {m.name}
                        {m.role !== 'member' && (
                          <span className="ml-1 text-xs opacity-75">({m.role})</span>
                        )}
                      </span>
                    ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm italic">No members have joined yet</p>
              )}
            </div>
          </div>
        )}

        <ErrorBoundary>
          {allowedView === "participant" && <ParticipantView state={state} dispatch={dispatch} currentUser={activeUser}/>}
          {allowedView === "chair" && <ChairView state={state} dispatch={dispatch}/>}
          {allowedView === "admin" && <AdminView state={state} dispatch={dispatch}/>}
        </ErrorBoundary>
      </div>

      {/* Rename Modal */}
      {isRenamingName && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setIsRenamingName(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-modal-title"
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 id="rename-modal-title" className="text-lg font-semibold text-gray-900">
                Change Your Name
              </h3>
              <button
                onClick={() => setIsRenamingName(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            {/* Warning banner */}
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Use a name others will recognize</p>
                  <p className="mt-1 text-amber-700">
                    You can only change your name once. If others can't identify you, you may not be recognized to speak or vote.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="new-name" className="block text-sm font-medium text-gray-700 mb-1">
                New Name
              </label>
              <input
                id="new-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSelfRename();
                  if (e.key === 'Escape') setIsRenamingName(false);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter your new name"
                minLength={2}
                maxLength={100}
                autoFocus
              />
              <p className="mt-1 text-xs text-gray-500">
                Name must be 2-100 characters
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setIsRenamingName(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSelfRename}
                disabled={newName.trim().length < 2 || newName.trim() === activeUser?.name}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test role switcher - only visible in DEMO meetings */}
      {currentUserEmail && (
        <TestRoleSwitcher
          meetingCode={state.meetingCode}
          email={currentUserEmail}
          currentRole={activeUser?.role || 'member'}
        />
      )}
    </div>
  );
}
