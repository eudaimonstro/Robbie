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
  MotionStackPanel
} from '../components/chair';
import { useSortedSpeakerQueue } from '../hooks/useSortedSpeakerQueue';
import { useQuorumStatus } from '../hooks/useQuorumStatus';

export function ChairView({ state, dispatch }: ChairViewProps) {
  // Use custom hook for sorted speaker queue with alternation
  const sortedQueue = useSortedSpeakerQueue(
    state.speakerQueue,
    state.currentMotion,
    state.lastSpeakerStance,
    state
  );

  // Use custom hook for quorum status
  const { presentCount, hasQuorum } = useQuorumStatus(state.members, state.quorum);

  // Get chair member
  const chair = useMemo(
    () => state.members.find(m => m.role === 'chair'),
    [state.members]
  );

  return (
    <div className="space-y-4">
      <ActiveSuspensionsBanner state={state} currentUser={chair} dispatch={dispatch} />

      {state.meetingActive && (
        <QuorumWarning
          presentCount={presentCount}
          quorum={state.quorum}
          hasQuorum={hasQuorum}
        />
      )}

      <MeetingControlPanel state={state} dispatch={dispatch} />

      <OrderOfBusinessPanel state={state} dispatch={dispatch} />

      <MinutesApprovalPanel state={state} dispatch={dispatch} />

      <CommitteeReportsPanel state={state} dispatch={dispatch} />

      <ChairScriptPanel state={state} />

      <AgendaPanel state={state} dispatch={dispatch} />

      <PendingSecondPanel state={state} dispatch={dispatch} />

      <PendingMotionPanel state={state} dispatch={dispatch} />

      <UnanimousConsentPanel state={state} dispatch={dispatch} />

      <VotingPanel
        state={state}
        dispatch={dispatch}
        hasQuorum={hasQuorum}
        presentCount={presentCount}
      />

      <SpeakerQueuePanel state={state} dispatch={dispatch} sortedQueue={sortedQueue} />

      {/* Nominations and Elections - only render when chair is defined */}
      {chair && (state.nominationsOpen ||
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
        <InquiryPanel
          state={state}
          dispatch={dispatch}
          currentUser={chair}
          isChair={true}
        />
      )}

      <MotionStackPanel state={state} />
    </div>
  );
}
