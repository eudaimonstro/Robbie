import type { ReactNode } from 'react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { phoneMoment, type PhoneMoment } from '../../utils/phoneMoment';
import { nomineesFor } from '../../utils/question';
import { NominationsPanel } from '../NominationsPanel';
import { ElectionPanel } from '../ElectionPanel';
import { UnanimousConsentSection } from '../participant';
import { VoteBlock } from './VoteBlock';
import { DebateBlock } from './DebateBlock';
import { MotionPanel } from './MotionPanel';
import type { MeetingDispatch } from '../../types/socket';

interface ActionBlockProps {
  state: MeetingState;
  dispatch: MeetingDispatch;
  me: Member;
}

function Note({ children }: { children: ReactNode }) {
  return <div className="space-y-1 text-ink-muted">{children}</div>;
}

/** The one thing the phone asks of its owner now */
export function ActionBlock({ state, dispatch, me }: ActionBlockProps) {
  const moment = phoneMoment(state);
  if (me.role === 'guest') {
    return <GuestBlock state={state} dispatch={dispatch} me={me} moment={moment} />;
  }

  switch (moment) {
    case 'lobby': {
      const chair = state.members.find((m) => m.role === 'chair');
      return (
        <Note>
          <p>The meeting has not been called to order yet.</p>
          {chair && <p>{chair.name} chairs it.</p>}
        </Note>
      );
    }
    case 'adjourned':
      // The phone shows only the adjournment then (PhoneView)
      return null;
    case 'adjourning':
      return (
        <Note>
          <p>The meeting has voted to adjourn. The chair declares it adjourned.</p>
        </Note>
      );
    case 'recess':
      return (
        <Note>
          <p>
            {state.recess?.until
              ? `The meeting is in recess until ${state.recess.until}.`
              : 'The meeting is in recess.'}
          </p>
          <p>The chair resumes it.</p>
        </Note>
      );
    case 'ruling':
      return (
        <Note>
          <p>The chair is ruling on a point of order.</p>
        </Note>
      );
    case 'voice-vote':
      return (
        <Note>
          <p>This is a voice vote: answer aloud in the room.</p>
        </Note>
      );
    case 'vote':
      return <VoteBlock state={state} dispatch={dispatch} me={me} />;
    case 'ballot':
      return <ElectionPanel state={state} dispatch={dispatch} currentUser={me} />;
    case 'nominate':
      return <NominationsPanel state={state} dispatch={dispatch} currentUser={me} />;
    case 'election':
      return <ElectionWaiting state={state} />;
    case 'second':
      return state.pendingSecond?.moverId === me.id ? (
        <Note>
          <p>You moved this. Another member must second it.</p>
        </Note>
      ) : (
        <button
          type="button"
          className="btn-primary btn-lg w-full"
          onClick={() =>
            dispatch({ type: 'SECOND_MOTION', seconder: me.name, timestamp: generateTimestamp() })
          }
        >
          Second
        </button>
      );
    case 'consent':
      return <UnanimousConsentSection state={state} dispatch={dispatch} currentUser={me} />;
    case 'agenda':
      return (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            The chair asks whether anyone objects to adopting the agenda. Without an objection, it
            is adopted.
          </p>
          <button
            type="button"
            className="btn-secondary btn-lg w-full"
            onClick={() => dispatch({ type: 'AGENDA_OBJECTION', timestamp: generateTimestamp() })}
          >
            Object to the agenda
          </button>
        </div>
      );
    case 'debate':
      return <DebateBlock state={state} dispatch={dispatch} me={me} />;
    case 'minutes':
      return (
        <Note>
          <p>To offer a correction, ask the chair for the floor in the room.</p>
        </Note>
      );
    case 'motion':
      return <MotionPanel state={state} dispatch={dispatch} me={me} />;
  }
}

/**
 * Between the steps of an election, while the chair has the next one: nominations closed with the
 * ballot still to open, or a winner awaiting the declaration
 */
function ElectionWaiting({ state }: { state: MeetingState }) {
  const election = state.currentElection;
  const position = election?.position ?? state.currentNominationPosition ?? '';
  const nominees = election ? election.candidates.map((c) => c.name) : nomineesFor(state, position);
  return (
    <div className="space-y-2">
      <p className="label-caps">{`Election for ${position}`}</p>
      {election?.elected ? (
        <p className="text-ink">{election.elected} has the vote required.</p>
      ) : nominees.length > 0 ? (
        <p className="text-ink">Nominated: {nominees.join(', ')}</p>
      ) : (
        <p className="text-ink">Nobody has been nominated.</p>
      )}
      <p className="text-ink-muted">Waiting for the chair.</p>
    </div>
  );
}

/**
 * A guest follows the meeting, asks to speak while a motion is debated, and asks the chair a
 * question (below, as members do): the only things the server lets a guest do
 */
function GuestBlock({ state, dispatch, me, moment }: ActionBlockProps & { moment: PhoneMoment }) {
  if (moment === 'adjourned') return null;
  if (moment === 'lobby') {
    return (
      <Note>
        <p>The meeting has not been called to order yet.</p>
      </Note>
    );
  }
  if (moment === 'recess') {
    return (
      <Note>
        <p>
          {state.recess?.until
            ? `The meeting is in recess until ${state.recess.until}.`
            : 'The meeting is in recess.'}
        </p>
      </Note>
    );
  }
  const waiting = state.speakerQueue.some((entry) => entry.member.id === me.id);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        You are a guest: you can follow the meeting, ask to speak and ask the chair a question.
        Guests don&apos;t move, second or vote.
      </p>
      {waiting ? (
        <button
          type="button"
          className="btn-secondary btn-lg w-full"
          onClick={() => dispatch({ type: 'LOWER_HAND', member: me })}
        >
          Withdraw the request
        </button>
      ) : moment !== 'debate' ? (
        <p className="text-sm text-ink-muted">
          You can ask to speak once a motion is being debated.
        </p>
      ) : (
        <button
          type="button"
          className="btn-primary btn-lg w-full"
          onClick={() => dispatch({ type: 'RAISE_HAND', member: me, stance: 'neutral' })}
        >
          Ask to speak
        </button>
      )}
    </div>
  );
}
