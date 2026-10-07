import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Crown, AlertTriangle, FileText } from 'lucide-react';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { Member } from '@robbie-bylawyer/shared/types';
import type { AdminViewProps } from '../types';
import { DraggableAgendaList } from '../components/DraggableAgendaList';
import { NominationsPanel } from '../components/NominationsPanel';
import { ElectionPanel } from '../components/ElectionPanel';
import { InquiryPanel } from '../components/InquiryPanel';
import { QuorumWarning } from '../components/QuorumWarning';
import { BylawyerLinkPanel } from '../components/BylawyerLinkPanel';
import {
  RoleChangeModal,
  RenameModal,
  MembersPanel,
  TimeLimitsPanel,
  MeetingSettingsPanel,
} from '../components/admin';
import { useQuorumStatus } from '../hooks/useQuorumStatus';
import { useSocket } from '../context/SocketContext';
import { useMeetingOrganization } from '../context/OrganizationBridge';

export function AdminView({ state, dispatch }: AdminViewProps) {
  const { currentUser } = useSocket();
  const { currentOrganization } = useMeetingOrganization();
  const [newItem, setNewItem] = useState('');
  const [speakerTime, setSpeakerTime] = useState(state.speakerTimeLimit);
  const [voteTime, setVoteTime] = useState(state.voteTimeLimit);
  const [quorumValue, setQuorumValue] = useState(state.quorum);
  const [roleChangeTarget, setRoleChangeTarget] = useState<Member | null>(null);
  const [selectedRole, setSelectedRole] = useState<'member' | 'chair' | 'admin'>('member');
  const [selectedChairId, setSelectedChairId] = useState<number | ''>('');
  const [renameTarget, setRenameTarget] = useState<Member | null>(null);
  const [newName, setNewName] = useState('');

  const { presentCount, totalMembers, hasQuorum } = useQuorumStatus(state.members, state.quorum);
  const currentChair = state.members.find((m) => m.role === 'chair');
  const eligibleForChair = state.members.filter((m) => m.present && m.role !== 'chair');
  // The signed-in admin (as a member of this meeting), not the first admin listed: with two
  // admins, votes, nominations and declines must be the right person's
  const adminUser = state.members.find((m) => m.id === currentUser?.id) ?? currentUser ?? undefined;

  const handleRoleChange = useCallback(() => {
    if (!roleChangeTarget) return;
    dispatch({
      type: 'SET_MEMBER_ROLE',
      targetMemberId: roleChangeTarget.id,
      newRole: selectedRole,
      timestamp: generateTimestamp(),
    });
    setRoleChangeTarget(null);
  }, [roleChangeTarget, selectedRole, dispatch]);

  const openRoleChangeModal = useCallback((member: Member) => {
    setRoleChangeTarget(member);
    // Guests can't be given a role here; the menu starts at member for them
    setSelectedRole(member.role === 'guest' ? 'member' : member.role);
  }, []);

  const handleAppointChair = useCallback(() => {
    if (!selectedChairId) return;
    dispatch({
      type: 'SET_MEMBER_ROLE',
      targetMemberId: selectedChairId as number,
      newRole: 'chair',
      timestamp: generateTimestamp(),
    });
    setSelectedChairId('');
  }, [selectedChairId, dispatch]);

  const openRenameModal = useCallback((member: Member) => {
    setRenameTarget(member);
    setNewName(member.name);
  }, []);

  const handleRename = useCallback(() => {
    if (!renameTarget || !newName.trim() || newName.trim().length < 2) return;
    dispatch({
      type: 'RENAME_MEMBER',
      memberId: renameTarget.id,
      newName: newName.trim(),
      renamedBy: currentUser?.id || renameTarget.id,
      timestamp: generateTimestamp(),
    });
    setRenameTarget(null);
    setNewName('');
  }, [renameTarget, newName, currentUser, dispatch]);

  const closeRenameModal = useCallback(() => {
    setRenameTarget(null);
    setNewName('');
  }, []);

  return (
    <div className="space-y-4">
      {state.meetingActive && (
        <QuorumWarning presentCount={presentCount} quorum={state.quorum} hasQuorum={hasQuorum} />
      )}

      {/* No Chair Warning */}
      {!state.meetingActive && !currentChair && (
        <div className="bg-accent-50 dark:bg-accent-900/20 border-2 border-accent-300 dark:border-accent-700 rounded-lg p-4 shadow-sm dark:shadow-secondary-900/20">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="text-accent-600 dark:text-accent-400" size={20} />
            <h3 className="font-semibold text-accent-800 dark:text-accent-300">
              No Chair Appointed
            </h3>
          </div>
          <p className="text-accent-700 dark:text-accent-400 text-sm mb-4">
            A chair must be appointed before the meeting can begin. Select a member below to appoint
            as chair.
          </p>
          {eligibleForChair.length > 0 ? (
            <div className="flex gap-2">
              <select
                value={selectedChairId}
                onChange={(e) => setSelectedChairId(e.target.value ? Number(e.target.value) : '')}
                className="flex-1 p-2 border border-accent-300 dark:border-accent-600 rounded-lg bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white"
              >
                <option value="">Select a member...</option>
                {eligibleForChair.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAppointChair}
                disabled={!selectedChairId}
                className="bg-accent-600 text-white px-4 py-2 rounded-lg hover:bg-accent-700 disabled:bg-secondary-300 dark:disabled:bg-secondary-600 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Crown size={16} />
                Appoint Chair
              </button>
            </div>
          ) : (
            <p className="text-accent-600 dark:text-accent-400 text-sm italic">
              No members have joined yet. Waiting for members to join...
            </p>
          )}
        </div>
      )}

      {/* Chair Status */}
      {!state.meetingActive && currentChair && (
        <div className="bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg p-4 shadow-sm dark:shadow-secondary-900/20">
          <div className="flex items-center gap-2">
            <Crown className="text-success-600 dark:text-success-400" size={20} />
            <span className="font-semibold text-success-800 dark:text-success-300">
              Chair: {currentChair.name}
            </span>
          </div>
          <p className="text-success-700 dark:text-success-400 text-sm mt-2">
            Waiting for the chair to call the meeting to order.
          </p>
        </div>
      )}

      <TimeLimitsPanel
        speakerTime={speakerTime}
        setSpeakerTime={setSpeakerTime}
        voteTime={voteTime}
        setVoteTime={setVoteTime}
        dispatch={dispatch}
      />

      <MeetingSettingsPanel
        quorumValue={quorumValue}
        setQuorumValue={setQuorumValue}
        currentQuorum={state.quorum}
        presentCount={presentCount}
        totalMembers={totalMembers}
        hasQuorum={hasQuorum}
        dispatch={dispatch}
      />

      {/* Bylawyer Integration */}
      {state.meetingCode && (
        <div className="space-y-2">
          <BylawyerLinkPanel
            meetingCode={state.meetingCode}
            suggestedOrgId={currentOrganization?.id}
          />
          <Link
            to="/"
            className="flex items-center justify-center gap-2 w-full py-2 px-4 text-sm text-meeting-600 dark:text-meeting-400 hover:text-meeting-700 dark:hover:text-meeting-300 hover:bg-meeting-50 dark:hover:bg-meeting-900/20 rounded-lg transition-colors"
          >
            <FileText size={16} />
            Open Documents Dashboard
          </Link>
        </div>
      )}

      <MembersPanel
        members={state.members}
        onRoleChange={openRoleChangeModal}
        onRename={openRenameModal}
      />

      {roleChangeTarget && (
        <RoleChangeModal
          member={roleChangeTarget}
          selectedRole={selectedRole}
          setSelectedRole={setSelectedRole}
          currentChair={currentChair}
          onConfirm={handleRoleChange}
          onCancel={() => setRoleChangeTarget(null)}
        />
      )}

      {renameTarget && (
        <RenameModal
          member={renameTarget}
          newName={newName}
          setNewName={setNewName}
          onConfirm={handleRename}
          onCancel={closeRenameModal}
        />
      )}

      <div className="card p-4">
        <h3 className="font-semibold mb-3 text-secondary-800 dark:text-white">
          Agenda {!state.agendaAdopted && '(Pending)'}
        </h3>
        {!state.agendaAdopted && (
          <p className="text-sm text-accent-600 dark:text-accent-400 mb-3">
            Drag to reorder before adoption.
          </p>
        )}
        <DraggableAgendaList
          agenda={state.agenda}
          dispatch={dispatch}
          disabled={state.agendaAdopted}
          showStatus={state.agendaAdopted}
        />
        {!state.agendaAdopted && (
          <div className="flex gap-2 mt-3">
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="New item"
              className="flex-1 p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white"
            />
            <button
              onClick={() => {
                dispatch({ type: 'ADD_AGENDA_ITEM', title: newItem, itemId: generateId() });
                setNewItem('');
              }}
              disabled={!newItem.trim()}
              className="bg-meeting-600 text-white px-6 rounded-lg hover:bg-meeting-700 disabled:bg-secondary-300 dark:disabled:bg-secondary-600"
            >
              Add
            </button>
          </div>
        )}
        {state.agendaAdopted && (
          <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-3">
            Adopted. Changes require a motion.
          </p>
        )}
      </div>

      {state.tabledMotions.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold mb-3 text-secondary-800 dark:text-white flex items-center gap-2">
            📋 Tabled Motions
            <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 text-xs px-2 py-0.5 rounded-full">
              {state.tabledMotions.length}
            </span>
          </h3>
          <div className="space-y-2">
            {state.tabledMotions.map((motion) => (
              <div
                key={motion.id}
                className="p-3 bg-secondary-50 dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg"
              >
                <p className="font-medium text-secondary-900 dark:text-white text-sm">
                  {motion.name}
                </p>
                <p className="text-secondary-700 dark:text-secondary-300 text-xs mt-1">
                  "{motion.text}"
                </p>
                <p className="text-secondary-500 dark:text-secondary-400 text-xs mt-1">
                  Moved by {motion.mover}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-3 italic">
            Use "Take from Table" motion to restore any of these motions
          </p>
        </div>
      )}

      {/* Nominations and Elections */}
      {adminUser &&
        (state.nominationsOpen ||
          state.currentElection ||
          state.currentNominationPosition ||
          state.electedOfficers.length > 0) && (
          <>
            <NominationsPanel
              state={state}
              dispatch={dispatch}
              currentUser={adminUser}
              isChair={false}
            />
            {(state.currentElection ||
              (!state.nominationsOpen && state.currentNominationPosition)) && (
              <ElectionPanel
                state={state}
                dispatch={dispatch}
                currentUser={adminUser}
                isChair={false}
              />
            )}
          </>
        )}

      {/* Inquiries Panel */}
      {adminUser && (
        <InquiryPanel state={state} dispatch={dispatch} currentUser={adminUser} isChair={false} />
      )}

      <div className="card p-4">
        <h3 className="font-semibold mb-3 text-secondary-800 dark:text-white">Meeting Log</h3>
        <div className="max-h-64 overflow-y-auto bg-secondary-50 dark:bg-secondary-800 rounded-lg p-3">
          {state.meetingLog.length === 0 ? (
            <p className="text-secondary-500 dark:text-secondary-400 text-center py-4">
              Not started
            </p>
          ) : (
            <ul className="space-y-1 text-sm font-mono">
              {state.meetingLog.map((e, i) => (
                <li key={i} className="text-secondary-700 dark:text-secondary-300">
                  <span className="text-secondary-400 dark:text-secondary-500">[{e.time}]</span>{' '}
                  {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
