import React, { useMemo } from 'react';
import type { ChairViewProps } from '../types';
import { ActiveSuspensionsBanner } from '../components/ActiveSuspensionsBanner';
import { NominationsPanel } from '../components/NominationsPanel';
import { ElectionPanel } from '../components/ElectionPanel';
import { InquiryPanel } from '../components/InquiryPanel';
import { QuorumWarning } from '../components/QuorumWarning';
import {
  MeetingControlPanel,
  OrderOfBusinessPanel,
  SpeakerQueuePanel,
  VotingPanel,
  PendingMotionPanel,
  MinutesApprovalPanel,
  CommitteeReportsPanel,
  AgendaPanel,
  UnanimousConsentPanel,
  PendingSecondPanel,
  ChairScriptPanel,
  MotionStackPanel,
  ProxyManagementPanel,
  MeetingDocumentsPanel,
} from '../components/chair';
import { useSortedSpeakerQueue } from '../hooks/useSortedSpeakerQueue';
import { useQuorumStatus } from '../hooks/useQuorumStatus';

export function ChairView({ state, dispatch, currentUser }: ChairViewProps) {
  // Use custom hook for sorted speaker queue with alternation
  const sortedQueue = useSortedSpeakerQueue(
    state.speakerQueue,
    state.currentMotion,
    state.lastSpeakerStance,
    state,
  );

  // Use custom hook for quorum status (with proxy support)
  const { presentCount, effectiveCount, hasQuorum } = useQuorumStatus(state.members, state.quorum, {
    proxiesCountForQuorum: state.proxiesCountForQuorum,
    proxies: state.proxies,
  });

  // The presiding officer: the member in the chair role, or the signed-in admin when the
  // meeting has no chair (the server lets admins perform every chair action)
  const chair = useMemo(
    () => state.members.find((m) => m.role === 'chair') ?? currentUser,
    [state.members, currentUser],
  );

  return (
    <div className="space-y-4">
      <ActiveSuspensionsBanner state={state} currentUser={chair} dispatch={dispatch} />

      {state.meetingActive && (
        <QuorumWarning presentCount={presentCount} quorum={state.quorum} hasQuorum={hasQuorum} />
      )}

      {/* Meeting controls - always full width */}
      <MeetingControlPanel state={state} dispatch={dispatch} />

      {/* Responsive grid layout for tablet/desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left column: Current business */}
        <div className="space-y-4">
          <OrderOfBusinessPanel state={state} dispatch={dispatch} />
          <MinutesApprovalPanel state={state} dispatch={dispatch} />
          <CommitteeReportsPanel state={state} dispatch={dispatch} />
          <ChairScriptPanel state={state} />
          <AgendaPanel state={state} dispatch={dispatch} presiding={chair} />
          <PendingSecondPanel state={state} dispatch={dispatch} />
          <PendingMotionPanel state={state} dispatch={dispatch} />
          <UnanimousConsentPanel state={state} dispatch={dispatch} />
          <VotingPanel
            state={state}
            dispatch={dispatch}
            hasQuorum={hasQuorum}
            presentCount={effectiveCount}
          />
        </div>

        {/* Right column: Speaker queue and members */}
        <div className="space-y-4">
          <SpeakerQueuePanel state={state} dispatch={dispatch} sortedQueue={sortedQueue} />
          <ProxyManagementPanel state={state} dispatch={dispatch} />

          {/* Meeting Documents - show when meeting has a code */}
          {state.meetingCode && <MeetingDocumentsPanel meetingCode={state.meetingCode} />}

          {/* Nominations and Elections - only render when chair is defined */}
          {chair &&
            (state.nominationsOpen ||
              state.currentElection ||
              state.currentNominationPosition ||
              state.electedOfficers.length > 0) && (
              <>
                <NominationsPanel
                  state={state}
                  dispatch={dispatch}
                  currentUser={chair}
                  isChair={true}
                />
                {(state.currentElection ||
                  (!state.nominationsOpen && state.currentNominationPosition)) && (
                  <ElectionPanel
                    state={state}
                    dispatch={dispatch}
                    currentUser={chair}
                    isChair={true}
                  />
                )}
              </>
            )}

          {/* Inquiries Panel - only render when chair is defined */}
          {chair && (
            <InquiryPanel state={state} dispatch={dispatch} currentUser={chair} isChair={true} />
          )}
        </div>
      </div>

      {/* Motion stack - full width at bottom */}
      <MotionStackPanel state={state} />
    </div>
  );
}
