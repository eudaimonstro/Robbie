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
        <div className="bg-caution-tint border-2 border-caution/40 rounded-lg p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="text-caution-ink" size={20} />
            <h3 className="font-semibold text-ink">No Chair Appointed</h3>
          </div>
          <p className="text-caution-ink text-sm mb-4">
            A chair must be appointed before the meeting can begin. Select a member below to appoint
            as chair.
          </p>
          {eligibleForChair.length > 0 ? (
            <div className="flex gap-2">
              <select
                value={selectedChairId}
                onChange={(e) => setSelectedChairId(e.target.value ? Number(e.target.value) : '')}
                className="flex-1 p-2 border border-caution/40 rounded-lg bg-surface text-ink"
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
                className="bg-gavel text-paper px-4 py-2 rounded-lg hover:bg-gavel/90 disabled:bg-rule disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Crown size={16} />
                Appoint Chair
              </button>
            </div>
          ) : (
            <p className="text-caution-ink text-sm italic">
              No members have joined yet. Waiting for members to join...
            </p>
          )}
        </div>
      )}

      {/* Chair Status */}
      {!state.meetingActive && currentChair && (
        <div className="bg-carried-tint border border-carried/40 rounded-lg p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Crown className="text-carried" size={20} />
            <span className="font-semibold text-ink">Chair: {currentChair.name}</span>
          </div>
          <p className="text-carried text-sm mt-2">
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
            className="flex items-center justify-center gap-2 w-full py-2 px-4 text-sm text-gavel hover:bg-gavel-tint rounded-lg transition-colors"
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
        <h3 className="font-semibold mb-3 text-ink">
          Agenda {!state.agendaAdopted && '(Pending)'}
        </h3>
        {!state.agendaAdopted && (
          <p className="text-sm text-caution-ink mb-3">Drag to reorder before adoption.</p>
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
              className="flex-1 p-3 border border-rule rounded-lg bg-surface text-ink"
            />
            <button
              onClick={() => {
                dispatch({ type: 'ADD_AGENDA_ITEM', title: newItem, itemId: generateId() });
                setNewItem('');
              }}
              disabled={!newItem.trim()}
              className="bg-gavel text-paper px-6 rounded-lg hover:bg-gavel/90 disabled:bg-rule"
            >
              Add
            </button>
          </div>
        )}
        {state.agendaAdopted && (
          <p className="text-xs text-ink-muted mt-3">Adopted. Changes require a motion.</p>
        )}
      </div>

      {state.tabledMotions.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold mb-3 text-ink flex items-center gap-2">
            Tabled Motions
            <span className="bg-gavel-tint text-ink text-xs px-2 py-0.5 rounded-full">
              {state.tabledMotions.length}
            </span>
          </h3>
          <div className="space-y-2">
            {state.tabledMotions.map((motion) => (
              <div key={motion.id} className="p-3 bg-surface-2 border border-rule rounded-lg">
                <p className="font-medium text-ink text-sm">{motion.name}</p>
                <p className="text-ink text-xs mt-1">"{motion.text}"</p>
                <p className="text-ink-muted text-xs mt-1">Moved by {motion.mover}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-muted mt-3 italic">
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
        <h3 className="font-semibold mb-3 text-ink">Meeting Log</h3>
        <div className="max-h-64 overflow-y-auto bg-surface-2 rounded-lg p-3">
          {state.meetingLog.length === 0 ? (
            <p className="text-ink-muted text-center py-4">Not started</p>
          ) : (
            <ul className="space-y-1 text-sm font-mono">
              {state.meetingLog.map((e, i) => (
                <li key={i} className="text-ink">
                  <span className="text-ink-muted">[{e.time}]</span> {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
