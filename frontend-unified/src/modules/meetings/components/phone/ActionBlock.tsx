import type { ReactNode } from 'react';
import {
  floorOpenForDebate,
  generateTimestamp,
  joinNames,
  takesPart,
  winnersOf,
} from '@robbie-bylawyer/shared/utils';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { phoneMoment, type PhoneMoment } from '../../utils/phoneMoment';
import { nomineesFor } from '../../utils/question';
import { NominationsPanel } from '../NominationsPanel';
import { ElectionPanel } from '../ElectionPanel';
import { UnanimousConsentSection } from '../participant';
import { VoteBlock } from './VoteBlock';
import { DebateBlock } from './DebateBlock';
import { MotionPanel } from './MotionPanel';
import { WithdrawMine } from './WithdrawMine';
import { ForumHand } from './ForumHand';
import { RaisePointOfOrder } from './RaisePointOfOrder';
import { LobbyNote } from './LobbyNote';
import type { MeetingDispatch } from '../../types/socket';

interface ActionBlockProps {
  state: MeetingState;
  dispatch: MeetingDispatch;
  me: Member;
}

function Note({ children }: { children: ReactNode }) {
  return <div className="space-y-1 text-ink-muted">{children}</div>;
}

/**
 * The one thing the phone asks of its owner now; right after the chair declares a voice vote's
 * result, a member may also call for a division (RONR 29:7), until other business comes up
 */
export function ActionBlock({ state, dispatch, me }: ActionBlockProps) {
  if (state.voiceVote && !state.votingOpen && takesPart(me)) {
    return (
      <div className="space-y-3">
        <div className="space-y-2 rounded-lg border border-rule p-4">
          <p className="text-sm text-ink">
            {`The chair declared the voice vote ${state.voiceVote.passed ? 'carried' : 'failed'}. If you doubt it, call for a division: the vote is counted.`}
          </p>
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => dispatch({ type: 'REQUEST_DIVISION', timestamp: generateTimestamp() })}
          >
            Call for a division
          </button>
        </div>
        <MomentAction state={state} dispatch={dispatch} me={me} />
      </div>
    );
  }
  return <MomentAction state={state} dispatch={dispatch} me={me} />;
}

function MomentAction({ state, dispatch, me }: ActionBlockProps) {
  const moment = phoneMoment(state);
  if (me.role === 'guest') {
    return <GuestBlock state={state} dispatch={dispatch} me={me} moment={moment} />;
  }
  if (!takesPart(me)) return <ObserverBlock state={state} me={me} moment={moment} />;

  switch (moment) {
    case 'lobby':
      return <LobbyNote state={state} me={me} />;
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
        <div className="space-y-3">
          <Note>
            <p>This is a voice vote: answer aloud in the room.</p>
            <p>If you doubt how it sounds, call for a division: the vote is counted instead.</p>
          </Note>
          <button
            type="button"
            className="btn-secondary btn-lg w-full"
            onClick={() => dispatch({ type: 'REQUEST_DIVISION', timestamp: generateTimestamp() })}
          >
            Call for a division
          </button>
          <RaisePointOfOrder state={state} dispatch={dispatch} me={me} />
        </div>
      );
    case 'vote':
      return (
        <div className="space-y-3">
          <VoteBlock state={state} dispatch={dispatch} me={me} />
          <RaisePointOfOrder state={state} dispatch={dispatch} me={me} />
        </div>
      );
    case 'ballot':
      return <ElectionPanel state={state} dispatch={dispatch} currentUser={me} />;
    case 'nominate':
      return <NominationsPanel state={state} dispatch={dispatch} currentUser={me} />;
    case 'election':
      return <ElectionWaiting state={state} />;
    case 'second':
      return state.pendingSecond?.moverId === me.id ? (
        <div className="space-y-3">
          <Note>
            <p>You moved this. Another member must second it.</p>
          </Note>
          <WithdrawMine state={state} dispatch={dispatch} me={me} />
          <RaisePointOfOrder state={state} dispatch={dispatch} me={me} />
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            className="btn-primary btn-lg w-full"
            onClick={() =>
              dispatch({ type: 'SECOND_MOTION', seconder: me.name, timestamp: generateTimestamp() })
            }
          >
            Second
          </button>
          <RaisePointOfOrder state={state} dispatch={dispatch} me={me} />
        </div>
      );
    case 'consent':
      return (
        <div className="space-y-3">
          <UnanimousConsentSection state={state} dispatch={dispatch} currentUser={me} />
          <RaisePointOfOrder state={state} dispatch={dispatch} me={me} />
        </div>
      );
    case 'withdraw-request':
      return (
        <Note>
          <p>{state.currentMotion?.mover} asks to withdraw the motion. The chair asks the room.</p>
        </Note>
      );
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
      return (
        <div className="space-y-3">
          <DebateBlock state={state} dispatch={dispatch} me={me} />
          <WithdrawMine state={state} dispatch={dispatch} me={me} />
        </div>
      );
    case 'debate-closed':
      return (
        <div className="space-y-3">
          <Note>
            <p>Debate is closed. The chair puts the question to the vote.</p>
          </Note>
          <details className="rounded-lg border border-rule">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink">
              Other motions
            </summary>
            <div className="border-t border-rule p-4">
              <MotionPanel state={state} dispatch={dispatch} me={me} othersOnly />
            </div>
          </details>
          <WithdrawMine state={state} dispatch={dispatch} me={me} />
        </div>
      );
    case 'minutes':
      return (
        <Note>
          <p>To offer a correction, ask the chair for the floor in the room.</p>
        </Note>
      );
    case 'motion':
      return (
        <div className="space-y-3">
          <ForumHand state={state} dispatch={dispatch} me={me} />
          <MotionPanel state={state} dispatch={dispatch} me={me} />
          <WithdrawMine state={state} dispatch={dispatch} me={me} />
        </div>
      );
  }
}

/**
 * Between the steps of an election, while the chair has the next one: nominations closed with the
 * ballot still to open, winners awaiting the declaration, or a seat still open for another ballot
 */
function ElectionWaiting({ state }: { state: MeetingState }) {
  const election = state.currentElection;
  const position = election?.position ?? state.currentNominationPosition ?? '';
  const nominees = election ? election.candidates.map((c) => c.name) : nomineesFor(state, position);
  const winners = election ? winnersOf(election) : [];
  return (
    <div className="space-y-2">
      <p className="label-caps">{`Election for ${position}`}</p>
      {winners.length > 0 ? (
        <p className="text-ink">
          {`${joinNames(winners)} ${winners.length > 1 ? 'have' : 'has'} the vote required.`}
        </p>
      ) : election && nominees.length > 0 ? (
        <p className="text-ink">Candidates for the next ballot: {nominees.join(', ')}</p>
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
/**
 * In a board meeting, a member who isn't a director: they follow it, and take no part (no motion,
 * second, vote or request for the floor)
 */
function ObserverBlock({
  state,
  me,
  moment,
}: Omit<ActionBlockProps, 'dispatch'> & { moment: PhoneMoment }) {
  if (moment === 'adjourned') return null;
  const voting = state.votingOpen || !!state.currentElection?.votingInProgress;
  return (
    <div className="space-y-3">
      <p className="font-semibold text-ink">You&apos;re observing this board meeting.</p>
      {moment === 'lobby' ? (
        <LobbyNote state={state} me={me} />
      ) : (
        <p className="text-sm text-ink-muted">
          {voting
            ? 'The directors are voting.'
            : moment === 'recess'
              ? 'The board is in recess.'
              : 'The directors move, second and vote. You can follow everything here.'}
        </p>
      )}
    </div>
  );
}

function GuestBlock({ state, dispatch, me, moment }: ActionBlockProps & { moment: PhoneMoment }) {
  if (moment === 'adjourned') return null;
  if (moment === 'lobby') return <LobbyNote state={state} me={me} />;
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
      ) : !floorOpenForDebate(state) ? (
        <p className="text-sm text-ink-muted">
          You can ask to speak while the floor is open for debate.
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
