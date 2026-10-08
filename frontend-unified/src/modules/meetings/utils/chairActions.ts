import { PUT_BY_CHAIR } from '@robbie-bylawyer/shared/constants';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import {
  attendanceSummary,
  awaitingRuling,
  calculateTimerEnd,
  fitMotionText,
  floorOpenForDebate,
  pendingNotOffered,
  sortSpeakerQueue,
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

/**
 * The chair's rulings on a point of order (or a request saved before they were questions): well
 * taken, well taken with the motion it is about ruled out of order (the one awaiting a second, or
 * the one beneath the point), or not well taken
 */
function rulings(state: MeetingState, motionType: string): ChairAction[] {
  switch (motionType) {
    case 'pointOrder': {
      const about = state.pendingSecond ?? state.motionStack.at(-2);
      return [
        ruling('sustain', 'Rule the point well taken', 'sustain', 'primary'),
        ...(about
          ? [
              {
                id: 'out-of-order',
                label: 'Rule the motion out of order',
                tone: 'secondary' as const,
                make: (): MeetingAction => ({
                  type: 'CHAIR_RULING',
                  ruling: 'sustain',
                  outOfOrder: true,
                  timestamp: generateTimestamp(),
                }),
              },
            ]
          : []),
        ruling('overrule', 'Rule the point not well taken', 'overrule', 'secondary'),
      ];
    }
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

/** The chair records the mover's withdrawing (or asking to withdraw) a motion, for the mover in the room */
function withdrawFromFloor(label: string): ChairAction {
  return {
    id: 'floor-withdraw',
    label,
    tone: 'secondary',
    make: () => ({
      type: 'WITHDRAW_MOTION',
      requesterId: 0,
      fromFloor: true,
      motionId: generateId(),
      timestamp: generateTimestamp(),
    }),
  };
}

/**
 * The speaker queue's next step: recognize the first person waiting (in the order the chair calls
 * them: the mover if they asked, then for and against in turn), or end the turn of the one who
 * has the floor
 */
function speakerActions(state: MeetingState): { recognize?: ChairAction; endTurn?: ChairAction } {
  const speaker = state.recognizedSpeaker;
  if (speaker) {
    return {
      endTurn: {
        id: 'end-turn',
        label: `End ${speaker.name}'s turn`,
        tone: 'secondary',
        make: () => ({ type: 'YIELD_FLOOR', timestamp: generateTimestamp() }),
      },
    };
  }
  const [first] = floorOpenForDebate(state) ? sortSpeakerQueue(state) : [];
  if (!first) return {};
  return {
    recognize: {
      id: 'recognize',
      label: `Recognize ${first.member.name}`,
      tone: 'primary',
      make: () => ({
        type: 'RECOGNIZE_SPEAKER',
        member: first.member,
        stance: first.stance,
        speakerTimerEnd: calculateTimerEnd(state.speakerTimeLimit),
        timestamp: generateTimestamp(),
      }),
    },
  };
}

/** A motion's words for a button: the first few, with an ellipsis */
function shortened(text: string, length = 48): string {
  return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;
}

/** What a meeting without a quorum may still vote on: adjourning, or a recess to find one */
const NO_QUORUM_NEEDED = new Set(['adjourn', 'recess']);

/**
 * Open the vote. Without a quorum (anything but adjourning or a recess) it asks the chair first,
 * and the vote is opened as confirmed, which the server requires.
 */
/**
 * Whether doing business now needs the chair to confirm there is no quorum: anything but
 * adjourning or a recess, as the server rules
 */
export function withoutQuorum(state: MeetingState): boolean {
  return (
    !attendanceSummary(state).hasQuorum && !NO_QUORUM_NEEDED.has(state.currentMotion?.type ?? '')
  );
}

function openVote(state: MeetingState, tone: Tone): ChairAction {
  const unconfirmed = withoutQuorum(state);
  return {
    id: 'open-vote',
    label: 'Open the vote',
    tone,
    make: () => ({
      type: 'OPEN_VOTING',
      voteTimerEnd: calculateTimerEnd(state.voteTimeLimit),
      ...(unconfirmed && { confirmedWithoutQuorum: true }),
      timestamp: generateTimestamp(),
    }),
    ...(unconfirmed && { confirm: true }),
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
  // An adjournment carried: the chair declares the meeting adjourned, and nothing else is in order
  if (state.adjournmentCarried) {
    return [
      {
        id: 'declare-adjourned',
        label: 'Declare the meeting adjourned',
        tone: 'primary',
        make: () => ({ type: 'END_MEETING', timestamp: generateTimestamp() }),
      },
    ];
  }
  // In a recess the chair resumes the meeting (or adjourns one nobody returns to)
  if (state.recess) {
    return [
      {
        id: 'resume',
        label: 'Resume the meeting',
        tone: 'primary',
        make: () => ({ type: 'RESUME_MEETING', timestamp: generateTimestamp() }),
      },
      adjourn('secondary'),
    ];
  }

  // A point of order waits for nothing: during a vote, or with a motion awaiting a second
  const motion = state.currentMotion;
  if (motion && motion.vote === 'none') return rulings(state, motion.type);

  if (state.votingOpen) return [];

  if (state.pendingSecond) {
    return [
      {
        id: 'no-second',
        label: 'No second',
        tone: 'secondary',
        make: () => ({ type: 'DECLINE_SECOND', timestamp: generateTimestamp() }),
      },
      withdrawFromFloor('The mover withdraws it'),
    ];
  }

  if (motion && state.unanimousConsentPending) {
    // Someone in the room without a phone objects aloud: the chair records it, and puts the
    // question to a vote
    return [
      {
        id: 'adopted',
        label:
          motion.type === 'withdrawMotion' ? 'No objection: withdrawn' : 'No objection: adopted',
        tone: 'primary',
        make: () => ({
          type: 'UNANIMOUS_CONSENT_PASSED',
          ...(withoutQuorum(state) && { confirmedWithoutQuorum: true }),
          timestamp: generateTimestamp(),
        }),
        ...(withoutQuorum(state) && { confirm: true }),
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
    // A motion Robbie no longer offers, from a meeting saved earlier: the mover withdraws it
    if (pendingNotOffered(state)) return [withdrawFromFloor('The mover asks to withdraw it')];
    // While a ballot is open nothing is put to a vote or to consent (the server refuses both)
    if (state.currentElection?.votingInProgress) {
      return [withdrawFromFloor('The mover asks to withdraw it')];
    }
    const consent: ChairAction = {
      id: 'consent',
      label: 'Ask for unanimous consent',
      tone: 'secondary',
      make: () => ({ type: 'REQUEST_UNANIMOUS_CONSENT', timestamp: generateTimestamp() }),
    };
    // The mover's request to withdraw is granted without objection, as a rule
    if (motion.type === 'withdrawMotion') {
      return [{ ...consent, tone: 'primary' }, openVote(state, 'secondary')];
    }
    // While debate goes on, recognizing the next speaker is the chair's next step
    const { recognize, endTurn } = speakerActions(state);
    const debating = !!recognize || !!endTurn;
    const debate = [...(recognize ? [recognize] : []), ...(endTurn ? [endTurn] : [])];
    // An appeal is decided by a vote
    if (motion.type === 'appeal')
      return [...debate, openVote(state, debating ? 'secondary' : 'primary')];
    return [
      ...debate,
      openVote(state, debating ? 'secondary' : 'primary'),
      consent,
      withdrawFromFloor('The mover asks to withdraw it'),
    ];
  }

  // An election's next step, which the election card has too (opening the ballot, which asks
  // the vote required, is the card's). A privileged or incidental motion made meanwhile is put
  // first, above. Nothing else comes up until it is decided or set aside, and nobody adjourns
  // while the ballot is open.
  if (electionUnderway(state)) {
    const election = state.currentElection;
    if (election?.votingInProgress) {
      return [
        {
          id: 'close-ballot',
          label: 'Close the ballot',
          tone: 'primary',
          make: () => ({ type: 'CLOSE_ELECTION', timestamp: generateTimestamp() }),
        },
        setAsideElection(),
      ];
    }
    const next: ChairAction[] = state.nominationsOpen
      ? [
          {
            id: 'close-nominations',
            label: 'Close nominations',
            tone: 'primary',
            make: () => ({ type: 'CLOSE_NOMINATIONS', timestamp: generateTimestamp() }),
          },
        ]
      : election?.elected
        ? [
            {
              id: 'declare-elected',
              label: `Declare ${election.elected} elected`,
              tone: 'primary',
              make: () => ({
                type: 'DECLARE_ELECTED',
                candidateName: election.elected!,
                timestamp: generateTimestamp(),
              }),
            },
          ]
        : [];
    return [...next, setAsideElection(), adjourn('secondary')];
  }

  if (!state.agendaAdopted) {
    // After an objection, a member moves to adopt or amend the agenda
    if (state.agendaObjection) return [adjourn('secondary')];
    return [
      {
        id: 'adopt-agenda',
        label: 'Adopt the agenda',
        tone: 'primary',
        make: () => ({
          type: 'ADOPT_AGENDA',
          ...(withoutQuorum(state) && { confirmedWithoutQuorum: true }),
          timestamp: generateTimestamp(),
        }),
        ...(withoutQuorum(state) && { confirm: true }),
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

  // A question postponed to later in the meeting, which the chair takes up when its time comes
  const takeUp = (state.postponedMotions ?? []).map((question): ChairAction => ({
    id: `take-up-${question.motions[0].id}`,
    label: `Take up: ${shortened(question.motions[0].text)}`,
    tone: 'secondary',
    make: () => ({
      type: 'TAKE_UP_POSTPONED',
      motionId: question.motions[0].id,
      timestamp: generateTimestamp(),
    }),
  }));

  // Someone asked for the floor with nothing pending (an open forum, questions on a report)
  const { recognize, endTurn } = speakerActions(state);
  const forum = [...(recognize ? [recognize] : []), ...(endTurn ? [endTurn] : [])];

  const item = state.currentAgendaItem;
  if (item) {
    // At the last item (often "Adjournment") the expected next step is to adjourn, which
    // completes the item too; before it, completing the item is
    const last = !state.agenda.some((i) => i.status === 'pending' && i.id !== item.id);
    // While the minutes are to be approved, approving them as read is the next step
    const approving = minutesItemUnderWay(state) && !state.minutesApproved;
    const busy = approving || forum.length > 0;
    const actions: ChairAction[] = [...forum];
    if (approving) {
      actions.push({
        id: 'approve-minutes',
        label: 'Approve as read',
        tone: recognize ? 'secondary' : 'primary',
        make: () => ({ type: 'APPROVE_MINUTES', timestamp: generateTimestamp() }),
      });
    }
    if (last) actions.push(adjourn(busy ? 'secondary' : 'primary'));
    actions.push({
      id: 'complete-item',
      label: 'Complete the item',
      tone: last || busy ? 'secondary' : 'primary',
      make: () => ({ type: 'COMPLETE_AGENDA_ITEM', id: item.id, timestamp: generateTimestamp() }),
    });
    if (presidingId !== null) {
      actions.push({
        id: 'put-question',
        label: 'Put a question',
        tone: 'secondary',
        // The console asks for the question's words (a report needs no vote); recorded as put
        // by the chair, with no mover and no second to wait for, and the server checks that the
        // one sending it presides
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
        confirm: true,
      });
    }
    actions.push(...takeUp);
    if (!last) actions.push(adjourn('secondary'));
    return actions;
  }

  const next = state.agenda.find((i) => i.status === 'pending');
  if (next) {
    return [
      ...forum,
      {
        id: 'call-next',
        label: `Call the next item: ${next.title}`,
        tone: forum.length > 0 ? 'secondary' : 'primary',
        make: () => ({ type: 'CALL_AGENDA_ITEM', id: next.id, timestamp: generateTimestamp() }),
      },
      ...takeUp,
      adjourn('secondary'),
    ];
  }
  return [...forum, ...takeUp, adjourn(forum.length > 0 ? 'secondary' : 'primary')];
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
