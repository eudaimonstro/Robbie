import { PUT_BY_CHAIR } from '@robbie-bylawyer/shared/constants';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import {
  awaitingRuling,
  calculateTimerEnd,
  fitMotionText,
  generateId,
  generateTimestamp,
  getValidMotions,
} from '@robbie-bylawyer/shared/utils';
import { minutesItemUnderWay } from './minutesApproval';

/** One thing the chair can do now, as a button in the console's toolbar */
export interface ChairAction {
  id: string;
  label: string;
  /** The expected next step is primary; the alternatives are secondary */
  tone: 'primary' | 'secondary';
  /** The action, made when the button is pressed (so its timestamp is that moment's) */
  make: () => MeetingAction;
  /** Asks the chair first (Adjourn): the console confirms before it dispatches */
  confirm?: boolean;
}

/** Business the chair records for someone in the room, each opening a short form */
export interface FloorAction {
  id: 'floor-motion' | 'floor-second';
  label: string;
  tone: 'secondary';
}

type Tone = ChairAction['tone'];
type Ruling = 'sustain' | 'overrule' | 'allow' | 'deny';

function ruling(id: string, label: string, kind: Ruling, tone: Tone): ChairAction {
  return {
    id,
    label,
    tone,
    make: () => ({ type: 'CHAIR_RULING', ruling: kind, timestamp: generateTimestamp() }),
  };
}

/** The chair's rulings on a point of order (or a request saved before they were questions) */
function rulings(motionType: string): ChairAction[] {
  switch (motionType) {
    case 'pointOrder':
      return [
        ruling('sustain', 'The point is well taken', 'sustain', 'primary'),
        ruling('overrule', 'The point is not well taken', 'overrule', 'secondary'),
      ];
    case 'questionPrivilege':
    case 'withdrawMotion':
      return [
        ruling('allow', 'Allow the request', 'allow', 'primary'),
        ruling('deny', 'Deny the request', 'deny', 'secondary'),
      ];
    case 'callOrderDay':
      return [ruling('orders-of-the-day', 'Proceed to the orders of the day', 'allow', 'primary')];
    default:
      // A point of information: the chair answers it or has it answered
      return [ruling('acknowledge', 'Acknowledge and respond', 'allow', 'primary')];
  }
}

function openVote(state: MeetingState, tone: Tone): ChairAction {
  return {
    id: 'open-vote',
    label: 'Open the vote',
    tone,
    make: () => ({
      type: 'OPEN_VOTING',
      voteTimerEnd: calculateTimerEnd(state.voteTimeLimit),
      timestamp: generateTimestamp(),
    }),
  };
}

function adjourn(tone: Tone): ChairAction {
  return {
    id: 'adjourn',
    label: 'Adjourn',
    tone,
    make: () => ({ type: 'END_MEETING', timestamp: generateTimestamp() }),
    confirm: true,
  };
}

/**
 * An election from nominations to the declaration: nominations open, closed with the ballot still
 * to open, the ballot open, or a winner awaiting the declaration. The election card runs it, and
 * the server refuses any motion meanwhile but a privileged or incidental one.
 */
export function electionUnderway(state: MeetingState): boolean {
  return state.nominationsOpen || !!state.currentNominationPosition || !!state.currentElection;
}

/** Sets the election aside: it asks first, and the election card offers it too */
export function setAsideElection(): ChairAction {
  return {
    id: 'set-aside',
    label: 'Set the election aside',
    tone: 'secondary',
    make: () => ({ type: 'SET_ASIDE_ELECTION', timestamp: generateTimestamp() }),
    confirm: true,
  };
}

/**
 * The chair's actions that are in order now, the expected next step first: never a wall of every
 * button (docs/design-brief.md). Closing a vote is the vote panel's, running an election the
 * election card's, and recognizing speakers the queue's. Adjourn is offered whenever nothing is
 * pending and no vote or ballot is open, during an agenda item and an election too. During an
 * election the chair can also set it aside, ballot or not: an election with no nominee has no
 * other way out.
 *
 * @param presidingId - who puts an agenda item to a vote: the chair, or the admin presiding
 */
export function chairActions(state: MeetingState, presidingId: number | null): ChairAction[] {
  if (state.meetingStage === 'adjourned') return [];
  if (!state.meetingActive) {
    return [
      {
        id: 'call-to-order',
        label: 'Call to order',
        tone: 'primary',
        make: () => ({ type: 'START_MEETING', timestamp: generateTimestamp() }),
      },
    ];
  }
  // A point of order waits for nothing: during a vote, or with a motion awaiting a second
  const motion = state.currentMotion;
  if (motion && motion.vote === 'none') return rulings(motion.type);

  if (state.votingOpen) return [];

  if (state.pendingSecond) {
    return [
      {
        id: 'no-second',
        label: 'No second',
        tone: 'secondary',
        make: () => ({ type: 'DECLINE_SECOND', timestamp: generateTimestamp() }),
      },
    ];
  }

  if (motion && state.unanimousConsentPending) {
    // Someone in the room without a phone objects aloud: the chair records it, and puts the
    // question to a vote
    return [
      {
        id: 'adopted',
        label: 'No objection: adopted',
        tone: 'primary',
        make: () => ({ type: 'UNANIMOUS_CONSENT_PASSED', timestamp: generateTimestamp() }),
      },
      {
        id: 'floor-objection',
        label: 'Objection from the floor',
        tone: 'secondary',
        make: () => ({
          type: 'OBJECT_TO_CONSENT',
          objector: '',
          fromFloor: true,
          timestamp: generateTimestamp(),
        }),
      },
    ];
  }
  if (motion) {
    return [
      openVote(state, 'primary'),
      {
        id: 'consent',
        label: 'Ask for unanimous consent',
        tone: 'secondary',
        make: () => ({ type: 'REQUEST_UNANIMOUS_CONSENT', timestamp: generateTimestamp() }),
      },
    ];
  }

  // The election card runs the rest of an election (a privileged or incidental motion made
  // meanwhile is put first, above). Nothing else comes up until it is decided or set aside, and
  // nobody adjourns while the ballot is open.
  if (electionUnderway(state)) {
    return state.currentElection?.votingInProgress
      ? [setAsideElection()]
      : [setAsideElection(), adjourn('secondary')];
  }

  if (!state.agendaAdopted) {
    // After an objection, a member moves to adopt or amend the agenda
    if (state.agendaObjection) return [adjourn('secondary')];
    return [
      {
        id: 'adopt-agenda',
        label: 'Adopt the agenda',
        tone: 'primary',
        make: () => ({ type: 'ADOPT_AGENDA', timestamp: generateTimestamp() }),
      },
      {
        id: 'agenda-objection',
        label: 'Objection to the agenda',
        tone: 'secondary',
        make: () => ({ type: 'AGENDA_OBJECTION', timestamp: generateTimestamp() }),
      },
      // Without a quorum, for one, the chair adjourns before any business
      adjourn('secondary'),
    ];
  }

  const item = state.currentAgendaItem;
  if (item) {
    // At the last item (often "Adjournment") the expected next step is to adjourn, which
    // completes the item too; before it, completing the item is
    const last = !state.agenda.some((i) => i.status === 'pending' && i.id !== item.id);
    // While the minutes are to be approved, their card has the expected next step
    const approving = minutesItemUnderWay(state) && !state.minutesApproved;
    const actions: ChairAction[] = last ? [adjourn('primary')] : [];
    actions.push({
      id: 'complete-item',
      label: 'Complete the item',
      tone: last || approving ? 'secondary' : 'primary',
      make: () => ({ type: 'COMPLETE_AGENDA_ITEM', id: item.id, timestamp: generateTimestamp() }),
    });
    if (presidingId !== null) {
      actions.push({
        id: 'put-item',
        label: 'Put the item to a vote',
        tone: 'secondary',
        // Recorded as put by the chair, with no mover and no second to wait for; the server
        // checks that the one sending it presides
        make: () => ({
          type: 'MAKE_MOTION',
          motionType: 'mainMotion',
          text: fitMotionText('Approve: ', item.title),
          mover: PUT_BY_CHAIR,
          moverId: presidingId,
          motionId: generateId(),
          putByChair: true,
          timestamp: generateTimestamp(),
        }),
      });
    }
    if (!last) actions.push(adjourn('secondary'));
    return actions;
  }

  const next = state.agenda.find((i) => i.status === 'pending');
  if (next) {
    return [
      {
        id: 'call-next',
        label: `Call the next item: ${next.title}`,
        tone: 'primary',
        make: () => ({ type: 'CALL_AGENDA_ITEM', id: next.id, timestamp: generateTimestamp() }),
      },
      adjourn('secondary'),
    ];
  }
  return [adjourn('primary')];
}

/**
 * What the chair can record for people in the room, many of them without a phone: a second for
 * the motion waiting for one, and a motion of any kind in order now (an amendment, close debate,
 * a point of order during a vote). They sit in the toolbar beside the chair's own actions.
 */
export function floorActions(state: MeetingState): FloorAction[] {
  if (!state.meetingActive || state.meetingStage === 'adjourned') return [];
  const actions: FloorAction[] = [];
  if (state.pendingSecond && !awaitingRuling(state)) {
    actions.push({ id: 'floor-second', label: 'Seconded from the floor', tone: 'secondary' });
  }
  if (getValidMotions(state).length > 0) {
    actions.push({ id: 'floor-motion', label: 'A motion from the floor', tone: 'secondary' });
  }
  return actions;
}
