import { useEffect, useRef } from 'react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { useSocket } from '../context/SocketContext';
import { useVoteResults } from '../hooks/useVoteResults';
import { adjournedAt, currentResult, describeQuestion, stageLabel } from '../utils/question';
import { useOwnHeader } from '../../../components/layout/appChrome';
import { scrollBehavior } from '../../../utils/motion';
import { QuestionCard } from '../components/QuestionCard';
import { Stamp } from '../components/Stamp';
import { TimerLine } from '../components/TimerLine';
import { ProxyAcceptancePanel, ProxyRequestPanel } from '../components/participant';
import { PhoneHeader } from '../components/phone/PhoneHeader';
import { ActionBlock } from '../components/phone/ActionBlock';
import { AskTheChair } from '../components/phone/AskTheChair';
import { PhoneAgenda, SpeakerList } from '../components/phone/MeetingLists';

/**
 * The phone view (docs/design-brief.md, "The three screens"), for members and guests: the last
 * result until the next question, what is happening now, the one thing to do about it, then the
 * queue, the agenda and a question for the chair. Its header stands in for the app's on a phone.
 */
export function PhoneView() {
  const { state, dispatch, currentUser, leaveMeeting } = useSocket();
  const voteResult = useVoteResults(state.meetingLog);
  const openMenu = useOwnHeader();
  const topRef = useRef<HTMLDivElement>(null);
  const adjourned = state.meetingStage === 'adjourned';

  // At the adjournment, back to the top, where the phone says so
  useEffect(() => {
    if (adjourned) topRef.current?.scrollIntoView?.({ behavior: scrollBehavior(), block: 'start' });
  }, [adjourned]);

  if (!currentUser) return null;

  const me = currentUser;
  const guest = me.role === 'guest';
  const question = describeQuestion(state);
  // A decision stays at the top until the next question comes up
  const result = currentResult(state, voteResult);
  const hasFloor = state.recognizedSpeaker?.id === me.id;
  // Said aloud to a screen reader as it happens: a vote or a ballot opening (the stamp says the
  // result). The region stays on the page, so a change to its words is read.
  const election = state.currentElection;
  const opening = state.votingOpen
    ? `The vote is open${question ? `: ${question.text}` : ''}`
    : election?.votingInProgress
      ? `The ballot is open for ${election.position}`
      : '';
  const header = (
    <PhoneHeader
      title={state.title || 'Live meeting'}
      item={stageLabel(state)}
      guest={guest}
      onLeave={leaveMeeting}
      onMenu={openMenu ?? undefined}
    />
  );

  if (adjourned) {
    const time = adjournedAt(state);
    return (
      <div
        ref={topRef}
        className="mx-auto max-w-lg space-y-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        {header}
        <section aria-label="Adjourned" className="card p-6 text-center">
          <p className="font-serif-soft text-title font-semibold text-ink">
            {time ? `The meeting was adjourned at ${time}` : 'The meeting was adjourned'}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div
      ref={topRef}
      className="mx-auto max-w-lg space-y-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
    >
      {header}
      <p role="status" className="sr-only" data-testid="phone-announcer">
        {opening}
      </p>
      {result && (
        <section aria-label="The result" className="card p-4">
          <Stamp
            key={result.key}
            outcome={result.outcome}
            subject={result.subject}
            tally={result.tally}
            size="phone"
          />
        </section>
      )}
      {!guest && <ProxyAcceptancePanel state={state} dispatch={dispatch} currentUser={me} />}
      {hasFloor && <FloorBanner state={state} dispatch={dispatch} />}
      {/* With the result up, nothing is pending: the card would only say so */}
      {!(result && !question) && (
        <QuestionCard
          question={question}
          size="phone"
          empty={
            state.meetingActive ? 'No question is pending.' : 'Nothing is before the meeting yet.'
          }
        />
      )}
      <section aria-label="Your part" className="card p-4">
        <ActionBlock state={state} dispatch={dispatch} me={me} />
      </section>
      <SpeakerList state={state} />
      <PhoneAgenda state={state} />
      {!guest && <ProxyRequestPanel state={state} dispatch={dispatch} currentUser={me} />}
      {state.meetingActive && <AskTheChair state={state} dispatch={dispatch} me={me} />}
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
