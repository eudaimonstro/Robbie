import type { ReactNode } from 'react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { phoneMoment, type PhoneMoment } from '../../utils/phoneMoment';
import { NominationsPanel } from '../NominationsPanel';
import { ElectionPanel } from '../ElectionPanel';
import { UnanimousConsentSection } from '../participant';
import { VoteBlock } from './VoteBlock';
import { DebateBlock } from './DebateBlock';
import { MotionPanel } from './MotionPanel';

interface ActionBlockProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
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
    case 'motion':
      return <MotionPanel state={state} dispatch={dispatch} me={me} />;
  }
}

/**
 * A guest follows the meeting, asks to speak and asks the chair a question (below, as members
 * do): the only things the server lets a guest do
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
