import { useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRoster } from '../hooks/useRoster';
import { useEligibleVoters } from '../hooks/useEligibleVoters';
import { usePacket } from '../hooks/usePacket';
import { useVoteResults } from '../hooks/useVoteResults';
import { useSortedSpeakerQueue } from '../hooks/useSortedSpeakerQueue';
import { chairActions, floorActions } from '../utils/chairActions';
import { adjournedAt, currentResult, describeQuestion } from '../utils/question';
import { ActiveSuspensionsBanner } from '../components/ActiveSuspensionsBanner';
import { QuestionCard } from '../components/QuestionCard';
import { Stamp } from '../components/Stamp';
import { InquiryPanel } from '../components/InquiryPanel';
import { AttendancePanel } from '../components/attendance/AttendancePanel';
import { SpeakerQueuePanel } from '../components/chair';
import { ActionToolbar } from '../components/console/ActionToolbar';
import { AdjournDialog } from '../components/console/AdjournDialog';
import { ElectionCard } from '../components/console/ElectionCard';
import { FloorMotionDialog, FloorSecondForm } from '../components/console/FloorBusiness';
import { ChairScriptLine } from '../components/console/ChairScriptLine';
import { ConsoleAgenda } from '../components/console/ConsoleAgenda';
import { ConsoleTopBar } from '../components/console/ConsoleTopBar';
import { CurrentItemLine } from '../components/console/CurrentItemLine';
import { JoinInfoCard } from '../components/console/JoinInfoCard';
import { MoreArea } from '../components/console/MoreArea';
import { VoteControl } from '../components/console/VoteControl';
import Modal from '../../../components/ui/Modal';
import type { ChairAction } from '../utils/chairActions';

/**
 * The chair console (docs/design-brief.md, "The three screens"), for the chair and admins: a top
 * bar, a "Now" column (columns 1 to 8 at 1280px) and a side column (9 to 12)
 */
export function ChairConsole() {
  const { state, dispatch, currentUser, attendance, meetingCode } = useSocket();
  const [joinInfoOpen, setJoinInfoOpen] = useState(false);
  const [adjourning, setAdjourning] = useState<ChairAction | null>(null);
  const [floorMotionOpen, setFloorMotionOpen] = useState(false);
  // The motion a second from the floor is being recorded for: the form closes with it
  const [secondingId, setSecondingId] = useState<number | null>(null);
  const nowRef = useRef<HTMLDivElement>(null);
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
  const presidingId = presiding?.id ?? null;
  const question = describeQuestion(state);
  const result = currentResult(state, voteResult);
  const adjourned = state.meetingStage === 'adjourned';
  const beforeMeeting = !state.meetingActive && !adjourned;
  const adjournedTime = adjournedAt(state);
  const empty = beforeMeeting
    ? 'The meeting has not been called to order.'
    : adjourned
      ? adjournedTime
        ? `Adjourned at ${adjournedTime}`
        : 'Adjourned'
      : 'No question is pending.';
  const seconding = secondingId !== null && state.pendingSecond?.id === secondingId;

  // An item called from the side agenda: bring the item and its actions into view
  const showNow = () =>
    nowRef.current?.firstElementChild?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });

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
        <div ref={nowRef} className="space-y-4 xl:col-span-8">
          {!adjourned && <JoinInfoCard code={meetingCode} compact={!beforeMeeting} />}
          <CurrentItemLine item={state.currentAgendaItem} packet={packet} />
          <QuestionCard question={question} empty={empty}>
            <ActionToolbar
              actions={chairActions(state, presidingId)}
              dispatch={dispatch}
              floor={floorActions(state)}
              onFloor={(id) =>
                id === 'floor-motion'
                  ? setFloorMotionOpen(true)
                  : setSecondingId(state.pendingSecond?.id ?? null)
              }
              onConfirm={setAdjourning}
            />
            {seconding && (
              <FloorSecondForm
                state={state}
                dispatch={dispatch}
                presidingId={presidingId}
                onDone={() => setSecondingId(null)}
              />
            )}
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
          {!adjourned && (
            <SpeakerQueuePanel state={state} dispatch={dispatch} sortedQueue={sortedQueue} />
          )}
        </div>

        <div className="space-y-4 xl:col-span-4">
          <AttendancePanel
            state={state}
            dispatch={dispatch}
            summary={attendance}
            roster={roster}
            rosterError={rosterError}
            eligible={eligible}
            readOnly={adjourned}
          />
          <ConsoleAgenda state={state} dispatch={dispatch} onCall={showNow} />
          {currentUser && <ElectionCard state={state} dispatch={dispatch} me={currentUser} />}
          {presiding && !adjourned && (
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
      <AdjournDialog
        isOpen={adjourning !== null}
        agenda={state.agenda}
        onAdjourn={() => {
          if (adjourning) dispatch(adjourning.make());
          setAdjourning(null);
        }}
        onKeepGoing={() => setAdjourning(null)}
      />
      <FloorMotionDialog
        isOpen={floorMotionOpen}
        onClose={() => setFloorMotionOpen(false)}
        state={state}
        dispatch={dispatch}
        presidingId={presidingId}
      />
    </div>
  );
}
