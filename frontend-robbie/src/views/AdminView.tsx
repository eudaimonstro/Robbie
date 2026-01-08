import React, { useState } from 'react';
import { Users, Settings, Timer, Crown, AlertTriangle, Pencil } from 'lucide-react';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { Member } from '@robbie-bylawyer/shared/types';
import type { AdminViewProps } from '../types';
import { DraggableAgendaList } from '../components/DraggableAgendaList';
import { NominationsPanel } from '../components/NominationsPanel';
import { ElectionPanel } from '../components/ElectionPanel';
import { InquiryPanel } from '../components/InquiryPanel';
import { QuorumWarning } from '../components/QuorumWarning';
import { BylawyerLinkPanel } from '../components/BylawyerLinkPanel';
import { useQuorumStatus } from '../hooks/useQuorumStatus';
import { useSocket } from '../context/SocketContext';

export function AdminView({ state, dispatch }: AdminViewProps) {
  const { currentUser } = useSocket();
  const [newItem, setNewItem] = useState("");
  const [speakerTime, setSpeakerTime] = useState(state.speakerTimeLimit);
  const [voteTime, setVoteTime] = useState(state.voteTimeLimit);
  const [quorumValue, setQuorumValue] = useState(state.quorum);
  const [roleChangeTarget, setRoleChangeTarget] = useState<Member | null>(null);
  const [selectedRole, setSelectedRole] = useState<'member' | 'chair' | 'admin'>('member');
  const [selectedChairId, setSelectedChairId] = useState<number | ''>('');
  const [renameTarget, setRenameTarget] = useState<Member | null>(null);
  const [newName, setNewName] = useState('');

  // Use custom hook for quorum status
  const { presentCount, totalMembers, hasQuorum } = useQuorumStatus(state.members, state.quorum);

  // Find current chair for warning message
  const currentChair = state.members.find(m => m.role === 'chair');

  // Get members eligible to be chair (present members who aren't already chair)
  const eligibleForChair = state.members.filter(m => m.present && m.role !== 'chair');

  const handleRoleChange = () => {
    if (!roleChangeTarget) return;

    dispatch({
      type: 'SET_MEMBER_ROLE',
      targetMemberId: roleChangeTarget.id,
      newRole: selectedRole,
      timestamp: generateTimestamp()
    });

    setRoleChangeTarget(null);
  };

  const openRoleChangeModal = (member: Member) => {
    setRoleChangeTarget(member);
    setSelectedRole(member.role);
  };

  const handleAppointChair = () => {
    if (!selectedChairId) return;
    dispatch({
      type: 'SET_MEMBER_ROLE',
      targetMemberId: selectedChairId as number,
      newRole: 'chair',
      timestamp: generateTimestamp()
    });
    setSelectedChairId('');
  };

  const openRenameModal = (member: Member) => {
    setRenameTarget(member);
    setNewName(member.name);
  };

  const handleRename = () => {
    if (!renameTarget || !newName.trim() || newName.trim().length < 2) return;
    dispatch({
      type: 'RENAME_MEMBER',
      memberId: renameTarget.id,
      newName: newName.trim(),
      renamedBy: currentUser?.id || renameTarget.id,
      timestamp: generateTimestamp()
    });
    setRenameTarget(null);
    setNewName('');
  };

  return (
    <div className="space-y-4">
      {state.meetingActive && (
        <QuorumWarning presentCount={presentCount} quorum={state.quorum} hasQuorum={hasQuorum} />
      )}

      {/* No Chair Warning - Show when meeting not started and no chair */}
      {!state.meetingActive && !currentChair && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 shadow">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="text-amber-600" size={20} />
            <h3 className="font-semibold text-amber-800">No Chair Appointed</h3>
          </div>
          <p className="text-amber-700 text-sm mb-4">
            A chair must be appointed before the meeting can begin. Select a member below to appoint as chair.
          </p>
          {eligibleForChair.length > 0 ? (
            <div className="flex gap-2">
              <select
                value={selectedChairId}
                onChange={(e) => setSelectedChairId(e.target.value ? Number(e.target.value) : '')}
                className="flex-1 p-2 border border-amber-300 rounded-lg bg-white"
              >
                <option value="">Select a member...</option>
                {eligibleForChair.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <button
                onClick={handleAppointChair}
                disabled={!selectedChairId}
                className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Crown size={16} />
                Appoint Chair
              </button>
            </div>
          ) : (
            <p className="text-amber-600 text-sm italic">
              No members have joined yet. Waiting for members to join...
            </p>
          )}
        </div>
      )}

      {/* Chair Status - Show when meeting not started but chair exists */}
      {!state.meetingActive && currentChair && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 shadow">
          <div className="flex items-center gap-2">
            <Crown className="text-green-600" size={20} />
            <span className="font-semibold text-green-800">Chair: {currentChair.name}</span>
          </div>
          <p className="text-green-700 text-sm mt-2">
            Waiting for the chair to call the meeting to order.
          </p>
        </div>
      )}

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
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Quorum Requirement</label>
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              value={quorumValue}
              onChange={(e) => setQuorumValue(Math.max(1, parseInt(e.target.value) || 1))}
              className="flex-1 p-2 border rounded-lg"
            />
            <button
              onClick={() => dispatch({ type: 'SET_QUORUM', quorum: quorumValue, timestamp: generateTimestamp() })}
              disabled={quorumValue === state.quorum}
              className="bg-indigo-600 text-white px-4 rounded-lg text-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Set
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">Minimum members required for quorum</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg"><p className="text-gray-500 text-sm">Required</p><p className="font-semibold text-lg">{state.quorum}</p></div>
          <div className="p-3 bg-gray-50 rounded-lg"><p className="text-gray-500 text-sm">Present</p><p className="font-semibold text-lg">{presentCount} / {totalMembers}</p></div>
        </div>
        <div className={`mt-3 p-3 rounded-lg ${hasQuorum ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {hasQuorum ? '✓ Quorum present' : '✗ No quorum'}
        </div>
      </div>

      {/* Bylawyer Integration */}
      {state.meetingCode && (
        <BylawyerLinkPanel meetingCode={state.meetingCode} />
      )}

      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><Users size={18}/> Members</h3>
        <ul className="space-y-2">
          {state.members.map(m => (
            <li key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="font-medium">{m.name}</span>
                <button
                  onClick={() => openRenameModal(m)}
                  className="text-gray-400 hover:text-indigo-600 p-1"
                  title="Rename member"
                >
                  <Pencil size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${m.role === 'chair' ? 'bg-purple-100 text-purple-800' : m.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-700'}`}>{m.role}</span>
                <button
                  onClick={() => openRoleChangeModal(m)}
                  className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                >
                  Change Role
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Role Change Modal */}
      {roleChangeTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h4 className="font-semibold text-lg mb-4">Change Role for {roleChangeTarget.name}</h4>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as 'member' | 'chair' | 'admin')}
              className="w-full p-2 border rounded-lg mb-4"
            >
              <option value="member">Member</option>
              <option value="chair">Chair</option>
              <option value="admin">Admin</option>
            </select>
            {selectedRole === 'chair' && roleChangeTarget.role !== 'chair' && currentChair && (
              <p className="text-amber-600 text-sm mb-4 bg-amber-50 p-3 rounded-lg">
                Note: {currentChair.name} (current chair) will be demoted to member.
              </p>
            )}
            {selectedRole === roleChangeTarget.role && (
              <p className="text-gray-500 text-sm mb-4">
                No change - {roleChangeTarget.name} is already {roleChangeTarget.role}.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleRoleChange}
                disabled={selectedRole === roleChangeTarget.role}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Confirm
              </button>
              <button
                onClick={() => setRoleChangeTarget(null)}
                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h4 className="font-semibold text-lg mb-4">Rename {renameTarget.name}</h4>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter new name"
              className="w-full p-2 border rounded-lg mb-4"
              autoFocus
            />
            {newName.trim().length > 0 && newName.trim().length < 2 && (
              <p className="text-red-500 text-sm mb-4">
                Name must be at least 2 characters.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleRename}
                disabled={!newName.trim() || newName.trim().length < 2 || newName.trim() === renameTarget.name}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Save
              </button>
              <button
                onClick={() => { setRenameTarget(null); setNewName(''); }}
                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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

      {state.tabledMotions.length > 0 && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800 flex items-center gap-2">
            📋 Tabled Motions
            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">{state.tabledMotions.length}</span>
          </h3>
          <div className="space-y-2">
            {state.tabledMotions.map((motion) => (
              <div key={motion.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="font-medium text-gray-900 text-sm">{motion.name}</p>
                <p className="text-gray-700 text-xs mt-1">"{motion.text}"</p>
                <p className="text-gray-500 text-xs mt-1">Moved by {motion.mover}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3 italic">
            Use "Take from Table" motion to restore any of these motions
          </p>
        </div>
      )}

      {/* Nominations and Elections */}
      {(state.nominationsOpen || state.currentElection || state.currentNominationPosition || state.electedOfficers.length > 0) && (
        <>
          <NominationsPanel
            state={state}
            dispatch={dispatch}
            currentUser={state.members.find(m => m.role === 'admin')!}
            isChair={false}
          />
          {(state.currentElection || (!state.nominationsOpen && state.currentNominationPosition)) && (
            <ElectionPanel
              state={state}
              dispatch={dispatch}
              currentUser={state.members.find(m => m.role === 'admin')!}
              isChair={false}
            />
          )}
        </>
      )}

      {/* Inquiries Panel */}
      <InquiryPanel
        state={state}
        dispatch={dispatch}
        currentUser={state.members.find(m => m.role === 'admin')!}
        isChair={false}
      />

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
