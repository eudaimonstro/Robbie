import { PUT_BY_CHAIR } from '@robbie-bylawyer/shared/constants';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { calculateTimerEnd, generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';

/** One thing the chair can do now, as a button in the console's toolbar */
export interface ChairAction {
  id: string;
  label: string;
  /** The expected next step is primary; the alternatives are secondary */
  tone: 'primary' | 'secondary';
  /** The action, made when the button is pressed (so its timestamp is that moment's) */
  make: () => MeetingAction;
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

/** The chair's rulings on a motion that takes no vote */
function rulings(motionType: string): ChairAction[] {
  switch (motionType) {
    case 'pointOrder':
      return [
        ruling('sustain', 'Sustain the point', 'sustain', 'primary'),
        ruling('overrule', 'Overrule the point', 'overrule', 'secondary'),
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
  };
}

/**
 * The chair's actions that are in order now, the expected next step first: never a wall of every
 * button (docs/design-brief.md). Closing a vote is the vote panel's, running an election the
 * election panel's, and recognizing speakers the queue's. Adjourn is offered whenever nothing is
 * pending, no vote is open and no election ballot is running, during an agenda item too.
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
  if (state.votingOpen || state.currentElection?.votingInProgress) return [];

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

  const motion = state.currentMotion;
  if (motion && state.unanimousConsentPending) {
    const actions: ChairAction[] = [
      {
        id: 'adopted',
        label: 'No objection: adopted',
        tone: 'primary',
        make: () => ({ type: 'UNANIMOUS_CONSENT_PASSED', timestamp: generateTimestamp() }),
      },
    ];
    if (motion.vote !== 'none') actions.push(openVote(state, 'secondary'));
    return actions;
  }
  if (motion) {
    if (motion.vote === 'none') return rulings(motion.type);
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
    const actions: ChairAction[] = last ? [adjourn('primary')] : [];
    actions.push({
      id: 'complete-item',
      label: 'Complete the item',
      tone: last ? 'secondary' : 'primary',
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
          text: `Approve: ${item.title}`,
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
