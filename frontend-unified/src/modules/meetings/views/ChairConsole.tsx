import { useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRoster } from '../hooks/useRoster';
import { useEligibleVoters } from '../hooks/useEligibleVoters';
import { usePacket } from '../hooks/usePacket';
import { useVoteResults } from '../hooks/useVoteResults';
import { useSortedSpeakerQueue } from '../hooks/useSortedSpeakerQueue';
import {
  chairActions,
  electionUnderway,
  floorActions,
  setAsideElection,
} from '../utils/chairActions';
import { adjournedAt, currentResult, describeQuestion } from '../utils/question';
import { QuestionCard } from '../components/QuestionCard';
import { Stamp } from '../components/Stamp';
import { InquiryPanel } from '../components/InquiryPanel';
import { AttendancePanel } from '../components/attendance/AttendancePanel';
import { SpeakerQueuePanel } from '../components/chair';
import { ActionToolbar } from '../components/console/ActionToolbar';
import { AdjournDialog } from '../components/console/AdjournDialog';
import { ElectionCard } from '../components/console/ElectionCard';
import { SetAsideDialog } from '../components/console/SetAsideDialog';
import { NoQuorumDialog } from '../components/console/NoQuorumDialog';
import { PutQuestionDialog } from '../components/console/PutQuestionDialog';
import { FloorMotionDialog, FloorSecondForm } from '../components/console/FloorBusiness';
import { ChairScriptLine } from '../components/console/ChairScriptLine';
import { ConsoleAgenda } from '../components/console/ConsoleAgenda';
import { ConsoleTopBar } from '../components/console/ConsoleTopBar';
import { CurrentItemLine } from '../components/console/CurrentItemLine';
import { JoinInfoCard } from '../components/console/JoinInfoCard';
import { MinutesApprovalCard } from '../components/console/MinutesApprovalCard';
import { MoreArea } from '../components/console/MoreArea';
import { VoteControl } from '../components/console/VoteControl';
import Modal from '../../../components/ui/Modal';
import { scrollBehavior } from '../../../utils/motion';
import type { ChairAction } from '../utils/chairActions';

/** What the chair is about to do without a quorum, by the action that asks first */
const NO_QUORUM_ASKS: Record<string, string> = {
  'open-vote': 'Open the vote',
  adopted: 'Adopt it',
  'adopt-agenda': 'Adopt the agenda',
};

/**
 * The chair console (docs/design-brief.md, "The three screens"), for the chair and admins: a top
 * bar, a "Now" column (columns 1 to 8 at 1280px) and a side column (9 to 12)
 */
export function ChairConsole() {
  const { state, dispatch, currentUser, attendance, meetingCode } = useSocket();
  const [joinInfoOpen, setJoinInfoOpen] = useState(false);
  // An action that asks first (Adjourn, Set the election aside), while its dialog is open
  const [confirming, setConfirming] = useState<ChairAction | null>(null);
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
  const electing = !adjourned && electionUnderway(state);
  const actions = chairActions(state, presidingId);
  // A dialog whose action the meeting has moved past (a vote opened, the election ended, the
  // meeting adjourned elsewhere) closes itself
  const stillInOrder =
    confirming === null ||
    (confirming.id === 'set-aside'
      ? electing
      : actions.some((action) => action.id === confirming.id));
  // Dropped as the render finds it out of order, so it can't come back when it is in order again
  if (!stillInOrder) setConfirming(null);
  const confirm = (action: ChairAction) => {
    dispatch(action.make());
    setConfirming(null);
  };
  const keepGoing = () => setConfirming(null);
  const setAside = () => setConfirming(setAsideElection());

  // An item called from the side agenda: bring the item and its actions into view
  const showNow = () =>
    nowRef.current?.firstElementChild?.scrollIntoView?.({
      behavior: scrollBehavior(),
      block: 'start',
    });

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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div ref={nowRef} className="space-y-4 xl:col-span-8">
          {!adjourned && <JoinInfoCard code={meetingCode} compact={!beforeMeeting} />}
          <CurrentItemLine item={state.currentAgendaItem} packet={packet} />
          {state.meetingActive && !attendance.hasQuorum && (
            <p
              role="status"
              className="rounded-lg bg-caution-tint px-4 py-3 font-semibold text-caution-ink"
            >
              No quorum: {attendance.present} present, {attendance.quorum} needed. Business done now
              is not valid.
            </p>
          )}
          <QuestionCard question={question} empty={empty}>
            <ActionToolbar
              actions={actions}
              dispatch={dispatch}
              floor={floorActions(state)}
              onFloor={(id) =>
                id === 'floor-motion'
                  ? setFloorMotionOpen(true)
                  : setSecondingId(state.pendingSecond?.id ?? null)
              }
              onConfirm={setConfirming}
            />
            {seconding && (
              <FloorSecondForm
                state={state}
                dispatch={dispatch}
                presidingId={presidingId}
                meId={currentUser?.id ?? null}
                onDone={() => setSecondingId(null)}
              />
            )}
            <ChairScriptLine state={state} />
          </QuestionCard>
          {/* Who is waiting to speak, right under the question: recognizing is the next step */}
          {!adjourned && (
            <SpeakerQueuePanel state={state} dispatch={dispatch} sortedQueue={sortedQueue} />
          )}
          <MinutesApprovalCard state={state} dispatch={dispatch} />
          {result && !adjourned && (
            <section aria-label="The result" className="card p-6">
              <Stamp
                key={result.key}
                outcome={result.outcome}
                subject={result.subject}
                tally={result.tally}
              />
            </section>
          )}
          {!adjourned && <VoteControl state={state} dispatch={dispatch} me={currentUser} />}
        </div>

        <div className="space-y-4 xl:col-span-4">
          {/* An election in hand comes first, where its next step is in view */}
          {currentUser && electing && (
            <ElectionCard
              state={state}
              dispatch={dispatch}
              me={currentUser}
              onSetAside={setAside}
            />
          )}
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
          {currentUser && !electing && (
            <ElectionCard state={state} dispatch={dispatch} me={currentUser} />
          )}
          {presiding && !adjourned && (
            <InquiryPanel state={state} dispatch={dispatch} currentUser={presiding} />
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
        isOpen={confirming?.id === 'adjourn' && stillInOrder}
        agenda={state.agenda}
        onAdjourn={() => confirming && confirm(confirming)}
        onKeepGoing={keepGoing}
      />
      <PutQuestionDialog
        isOpen={confirming?.id === 'put-question' && stillInOrder}
        item={state.currentAgendaItem?.title ?? null}
        onPut={(text) => {
          if (!confirming) return;
          const put = confirming.make();
          if (put.type === 'MAKE_MOTION') dispatch({ ...put, text });
          setConfirming(null);
        }}
        onClose={keepGoing}
      />
      <NoQuorumDialog
        isOpen={!!confirming && NO_QUORUM_ASKS[confirming.id] !== undefined && stillInOrder}
        attendance={`${attendance.present} present, ${attendance.quorum} needed`}
        question={`${NO_QUORUM_ASKS[confirming?.id ?? ''] ?? 'Go ahead'} anyway?`}
        confirmText={`${NO_QUORUM_ASKS[confirming?.id ?? ''] ?? 'Go ahead'} anyway`}
        onOpen={() => confirming && confirm(confirming)}
        onWait={keepGoing}
      />
      <SetAsideDialog
        isOpen={confirming?.id === 'set-aside' && stillInOrder}
        position={state.currentElection?.position ?? state.currentNominationPosition}
        onSetAside={() => confirming && confirm(confirming)}
        onKeepGoing={keepGoing}
      />
      <FloorMotionDialog
        isOpen={floorMotionOpen}
        onClose={() => setFloorMotionOpen(false)}
        state={state}
        dispatch={dispatch}
        presidingId={presidingId}
        meId={currentUser?.id ?? null}
      />
    </div>
  );
}
