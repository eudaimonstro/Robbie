import { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRoster } from '../hooks/useRoster';
import { useEligibleVoters } from '../hooks/useEligibleVoters';
import { usePacket } from '../hooks/usePacket';
import { useVoteResults } from '../hooks/useVoteResults';
import { useSortedSpeakerQueue } from '../hooks/useSortedSpeakerQueue';
import { chairActions } from '../utils/chairActions';
import { currentResult, describeQuestion } from '../utils/question';
import { ActiveSuspensionsBanner } from '../components/ActiveSuspensionsBanner';
import { QuestionCard } from '../components/QuestionCard';
import { Stamp } from '../components/Stamp';
import { NominationsPanel } from '../components/NominationsPanel';
import { ElectionPanel } from '../components/ElectionPanel';
import { InquiryPanel } from '../components/InquiryPanel';
import { AttendancePanel } from '../components/attendance/AttendancePanel';
import { SpeakerQueuePanel } from '../components/chair';
import { ActionToolbar } from '../components/console/ActionToolbar';
import { ChairScriptLine } from '../components/console/ChairScriptLine';
import { ConsoleAgenda } from '../components/console/ConsoleAgenda';
import { ConsoleTopBar } from '../components/console/ConsoleTopBar';
import { CurrentItemLine } from '../components/console/CurrentItemLine';
import { JoinInfoCard } from '../components/console/JoinInfoCard';
import { MoreArea } from '../components/console/MoreArea';
import { VoteControl } from '../components/console/VoteControl';
import Modal from '../../../components/ui/Modal';

/**
 * The chair console (docs/design-brief.md, "The three screens"), for the chair and admins: a top
 * bar, a "Now" column (columns 1 to 8 at 1280px) and a side column (9 to 12)
 */
export function ChairConsole() {
  const { state, dispatch, currentUser, attendance, meetingCode } = useSocket();
  const [joinInfoOpen, setJoinInfoOpen] = useState(false);
  const { roster, error: rosterError } = useRoster(meetingCode);
  const eligible = useEligibleVoters(state.organizationId, roster);
  // Loaded again at the call to order and the adjournment, for the start time
  const packet = usePacket(meetingCode, state.meetingActive);
  const voteResult = useVoteResults(state.meetingLog);
  const sortedQueue = useSortedSpeakerQueue(
    state.speakerQueue,
    state.currentMotion,
    state.lastSpeakerStance,
    state,
  );

  // The presiding officer: the member in the chair, or the signed-in admin when there is none
  // (the server lets admins do everything a chair does)
  const presiding = state.members.find((m) => m.role === 'chair') ?? currentUser;
  const question = describeQuestion(state);
  const result = currentResult(state, voteResult);
  const beforeMeeting = !state.meetingActive && state.meetingStage !== 'adjourned';
  const showElection =
    !!state.currentElection || (!state.nominationsOpen && !!state.currentNominationPosition);
  const empty = beforeMeeting
    ? 'The meeting has not been called to order.'
    : state.meetingStage === 'adjourned'
      ? 'The meeting is adjourned.'
      : 'No question is pending.';

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <ConsoleTopBar
        state={state}
        attendance={attendance}
        eligible={eligible}
        startedAt={packet?.startedAt ?? null}
        meetingCode={meetingCode}
        onJoinInfo={() => setJoinInfoOpen(true)}
      />
      <ActiveSuspensionsBanner
        state={state}
        currentUser={presiding ?? undefined}
        dispatch={dispatch}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <JoinInfoCard code={meetingCode} compact={!beforeMeeting} />
          <CurrentItemLine item={state.currentAgendaItem} packet={packet} />
          <QuestionCard question={question} empty={empty}>
            <ActionToolbar
              actions={chairActions(state, presiding?.id ?? null)}
              dispatch={dispatch}
            />
            <ChairScriptLine state={state} />
          </QuestionCard>
          {result && (
            <section aria-label="The result" className="card p-6">
              <Stamp
                key={result.key}
                outcome={result.outcome}
                subject={result.subject}
                tally={result.tally}
              />
            </section>
          )}
          <VoteControl state={state} dispatch={dispatch} me={currentUser} />
          <SpeakerQueuePanel state={state} dispatch={dispatch} sortedQueue={sortedQueue} />
        </div>

        <div className="space-y-4 xl:col-span-4">
          <AttendancePanel
            state={state}
            dispatch={dispatch}
            summary={attendance}
            roster={roster}
            rosterError={rosterError}
            eligible={eligible}
          />
          <ConsoleAgenda state={state} dispatch={dispatch} />
          {currentUser && (
            <NominationsPanel state={state} dispatch={dispatch} currentUser={currentUser} isChair />
          )}
          {currentUser && showElection && (
            <ElectionPanel state={state} dispatch={dispatch} currentUser={currentUser} isChair />
          )}
          {presiding && (
            <InquiryPanel state={state} dispatch={dispatch} currentUser={presiding} isChair />
          )}
          <MoreArea
            state={state}
            dispatch={dispatch}
            me={currentUser}
            meetingCode={meetingCode}
            organizationId={state.organizationId}
          />
        </div>
      </div>

      <Modal
        isOpen={joinInfoOpen}
        onClose={() => setJoinInfoOpen(false)}
        title="Join this meeting"
        size="lg"
      >
        <JoinInfoCard code={meetingCode} qrSize={240} />
      </Modal>
    </div>
  );
}
