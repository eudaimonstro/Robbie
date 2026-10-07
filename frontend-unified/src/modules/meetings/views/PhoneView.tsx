import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { useSocket } from '../context/SocketContext';
import { useVoteResults } from '../hooks/useVoteResults';
import { currentResult, describeQuestion, voteResultView } from '../utils/question';
import { QuestionCard } from '../components/QuestionCard';
import { Stamp } from '../components/Stamp';
import { TimerLine } from '../components/TimerLine';
import { InquiryPanel } from '../components/InquiryPanel';
import { ProxyAcceptancePanel, ProxyRequestPanel } from '../components/participant';
import { PhoneHeader } from '../components/phone/PhoneHeader';
import { ActionBlock } from '../components/phone/ActionBlock';
import { PhoneAgenda, SpeakerList } from '../components/phone/MeetingLists';

/**
 * The phone view (docs/design-brief.md, "The three screens"), for members and guests: what is
 * happening now, the one thing to do about it, then the queue, the agenda and the last result
 */
export function PhoneView() {
  const { state, dispatch, currentUser, leaveMeeting } = useSocket();
  const voteResult = useVoteResults(state.meetingLog);
  if (!currentUser) return null;

  const me = currentUser;
  const guest = me.role === 'guest';
  const question = describeQuestion(state);
  // The latest decision stays below the action block until the next vote opens
  const result =
    currentResult(state, voteResult) ??
    (voteResult && !state.votingOpen ? voteResultView(voteResult) : null);
  const hasFloor = state.recognizedSpeaker?.id === me.id;
  const empty =
    state.meetingStage === 'adjourned'
      ? 'The meeting is adjourned.'
      : !state.meetingActive
        ? 'Nothing is before the meeting yet.'
        : 'No question is pending.';

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <PhoneHeader
        title={state.title || 'Live meeting'}
        item={state.currentAgendaItem?.title ?? null}
        guest={guest}
        onLeave={leaveMeeting}
      />
      {!guest && <ProxyAcceptancePanel state={state} dispatch={dispatch} currentUser={me} />}
      {hasFloor && <FloorBanner state={state} dispatch={dispatch} />}
      <QuestionCard question={question} size="phone" empty={empty} />
      <section aria-label="Your part" className="card p-4">
        <ActionBlock state={state} dispatch={dispatch} me={me} />
      </section>
      <SpeakerList state={state} />
      <PhoneAgenda state={state} />
      {result && (
        <section aria-label="Last result" className="card p-4">
          <Stamp
            key={result.key}
            outcome={result.outcome}
            subject={result.subject}
            tally={result.tally}
            size="phone"
          />
        </section>
      )}
      {!guest && <ProxyRequestPanel state={state} dispatch={dispatch} currentUser={me} />}
      {!guest && (
        <InquiryPanel state={state} dispatch={dispatch} currentUser={me} isChair={false} />
      )}
    </div>
  );
}

/** For the member the chair recognized: their time, and Yield the floor */
function FloorBanner({
  state,
  dispatch,
}: {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}) {
  return (
    <section aria-label="You have the floor" className="card space-y-3 border-carried p-4">
      <p className="font-serif-soft text-lg font-semibold text-ink">You have the floor</p>
      <TimerLine
        endTime={state.speakerTimerEnd}
        totalSeconds={state.speakerTimeLimit}
        label="Your time"
      />
      <button
        type="button"
        className="btn-secondary w-full"
        onClick={() => dispatch({ type: 'YIELD_FLOOR', timestamp: generateTimestamp() })}
      >
        Yield the floor
      </button>
    </section>
  );
}
