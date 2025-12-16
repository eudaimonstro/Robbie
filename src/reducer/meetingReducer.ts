import { MOTIONS } from '../constants/motions';
import { applyMotionOutcome } from '../utils/motionOutcomeHelper';
import type { MeetingState, MeetingAction, MeetingLogEntry } from '../types';

export function meetingReducer(state: MeetingState, action: MeetingAction): MeetingState {
  // Helper to add log entry (timestamp now comes from action)
  const log = (timestamp: string, msg: string): MeetingLogEntry[] =>
    [...state.meetingLog, { time: timestamp, message: msg }];

  switch (action.type) {
    case 'START_MEETING':
      return {
        ...state,
        meetingActive: true,
        meetingStage: 'call-to-order',
        meetingCode: action.meetingCode,
        meetingLog: log(action.timestamp, "Meeting called to order.")
      };

    case 'END_MEETING':
      return {
        ...state,
        meetingActive: false,
        meetingStage: 'adjourned',
        meetingLog: log(action.timestamp, "Meeting adjourned.")
      };

    case 'MAKE_MOTION': {
      const motionDef = MOTIONS[action.motionType];
      const motion = {
        ...motionDef,
        id: action.motionId,
        type: action.motionType,
        text: action.text,
        mover: action.mover,
        moverId: action.moverId,
        secondedBy: null,
        status: "pending" as const,
        isAgendaAdoption: action.motionType === 'adoptAgenda',
        agendaAmendment: action.agendaAmendment || null,
        moverHasSpoken: false
      };
      if (motion.needsSecond) {
        return {
          ...state,
          pendingSecond: motion,
          meetingLog: log(action.timestamp, `${action.mover} moves: "${action.text}" (${motion.name}). Awaiting second.`)
        };
      }
      return {
        ...state,
        currentMotion: motion,
        motionStack: [...state.motionStack, motion],
        meetingLog: log(action.timestamp, `${action.mover} raises ${motion.name}.`)
      };
    }

    case 'SECOND_MOTION':
      if (!state.pendingSecond) return state;
      const seconded = { ...state.pendingSecond, secondedBy: action.seconder, status: "active" as const };
      return {
        ...state,
        pendingSecond: null,
        currentMotion: seconded,
        motionStack: [...state.motionStack, seconded],
        meetingLog: log(action.timestamp, `${action.seconder} seconds the motion.`)
      };

    case 'DECLINE_SECOND':
      return {
        ...state,
        pendingSecond: null,
        meetingLog: log(action.timestamp, "Motion fails for lack of a second.")
      };

    case 'OPEN_VOTING':
      return {
        ...state,
        votingOpen: true,
        voteTimerEnd: action.voteTimerEnd,
        votes: { yea: 0, nay: 0, abstain: 0 },
        voters: [],
        meetingLog: log(action.timestamp, `Chair puts the question: "${state.currentMotion?.text}"`)
      };

    case 'CAST_VOTE': {
      if (state.voters.includes(action.voterId)) return state;

      // Check if voter is chair
      const voter = state.members.find(m => m.id === action.voterId);
      const isChair = voter?.role === 'chair';

      // Chair can only vote on ballot votes or when it affects outcome
      if (isChair && state.votingMethod !== 'ballot' && !action.isChairDecidingVote) {
        return state; // Chair cannot vote with members
      }

      const newVotes = { ...state.votes };
      newVotes[action.vote]++;
      return { ...state, votes: newVotes, voters: [...state.voters, action.voterId] };
    }

    case 'CLOSE_VOTING': {
      const { yea, nay } = state.votes;
      const total = yea + nay;
      const threshold = state.currentMotion?.vote === "2/3" ? total * 2/3 : total / 2;
      const passed = yea > threshold;
      const newStack = state.motionStack.slice(0, -1);

      // Track defeated motions for renewal rule enforcement
      const defeatedMotions = !passed && state.currentMotion
        ? [...state.defeatedMotions, {
            type: state.currentMotion.type,
            text: state.currentMotion.text,
            timestamp: action.timestamp
          }]
        : state.defeatedMotions;

      // Apply motion outcome if passed
      const outcome = passed ? applyMotionOutcome(state) : {
        tabledMotions: state.tabledMotions,
        agendaAdopted: state.agendaAdopted,
        agendaObjection: state.agendaObjection,
        agenda: state.agenda
      };

      return {
        ...state,
        votingOpen: false,
        voteTimerEnd: null,
        currentMotion: newStack[newStack.length - 1] || null,
        motionStack: newStack,
        defeatedMotions,
        ...outcome,
        meetingLog: log(action.timestamp, `Vote: Yea ${yea}, Nay ${nay}. Motion ${passed ? "CARRIED" : "FAILED"}.`)
      };
    }

    case 'RAISE_HAND':
      if (state.speakerQueue.find(s => s.id === action.member.id)) return state;
      return { ...state, speakerQueue: [...state.speakerQueue, action.member] };

    case 'LOWER_HAND':
      return { ...state, speakerQueue: state.speakerQueue.filter(s => s.id !== action.member.id) };

    case 'RECOGNIZE_SPEAKER': {
      // Mark motion maker as having spoken if they're being recognized
      const updatedMotion = state.currentMotion && state.currentMotion.moverId === action.member.id
        ? { ...state.currentMotion, moverHasSpoken: true }
        : state.currentMotion;

      // Update motion stack if current motion was updated
      const updatedStack = updatedMotion && updatedMotion !== state.currentMotion
        ? state.motionStack.map(m => m.id === updatedMotion.id ? updatedMotion : m)
        : state.motionStack;

      return {
        ...state,
        currentMotion: updatedMotion,
        motionStack: updatedStack,
        recognizedSpeaker: action.member,
        speakerTimerEnd: action.speakerTimerEnd,
        speakerQueue: state.speakerQueue.filter(s => s.id !== action.member.id),
        meetingLog: log(action.timestamp, `Chair recognizes ${action.member.name}.`)
      };
    }

    case 'YIELD_FLOOR':
      return {
        ...state,
        recognizedSpeaker: null,
        speakerTimerEnd: null,
        meetingLog: log(action.timestamp, `${state.recognizedSpeaker?.name} yields the floor.`)
      };

    case 'ADD_AGENDA_ITEM':
      return {
        ...state,
        agenda: [...state.agenda, { id: action.itemId, title: action.title, status: "pending" as const }]
      };

    case 'REMOVE_AGENDA_ITEM':
      return { ...state, agenda: state.agenda.filter(a => a.id !== action.id) };

    case 'ADOPT_AGENDA':
      return {
        ...state,
        agendaAdopted: true,
        agendaObjection: false,
        meetingLog: log(action.timestamp, "Agenda adopted by unanimous consent.")
      };

    case 'AGENDA_OBJECTION':
      return {
        ...state,
        agendaObjection: true,
        meetingLog: log(action.timestamp, "Objection raised to agenda.")
      };

    case 'CALL_AGENDA_ITEM': {
      const item = state.agenda.find(a => a.id === action.id);
      const updatedAgenda = state.agenda.map(a =>
        a.id === action.id
          ? { ...a, status: "active" as const }
          : a.status === "active"
          ? { ...a, status: "pending" as const }
          : a
      );
      return {
        ...state,
        currentAgendaItem: item,
        agenda: updatedAgenda,
        meetingLog: log(action.timestamp, `Chair calls: "${item?.title}"`)
      };
    }

    case 'COMPLETE_AGENDA_ITEM': {
      const updatedAgenda = state.agenda.map(a =>
        a.id === action.id ? { ...a, status: "completed" as const } : a
      );
      return {
        ...state,
        currentAgendaItem: null,
        agenda: updatedAgenda,
        meetingLog: log(action.timestamp, `Completed: "${state.currentAgendaItem?.title}"`)
      };
    }

    case 'REORDER_AGENDA': {
      const { fromIndex, toIndex } = action;
      const newAgenda = [...state.agenda];
      const [moved] = newAgenda.splice(fromIndex, 1);
      newAgenda.splice(toIndex, 0, moved);
      return { ...state, agenda: newAgenda };
    }

    case 'SET_SPEAKER_TIME_LIMIT':
      return { ...state, speakerTimeLimit: action.seconds };

    case 'SET_VOTE_TIME_LIMIT':
      return { ...state, voteTimeLimit: action.seconds };

    case 'REQUEST_UNANIMOUS_CONSENT':
      return {
        ...state,
        unanimousConsentPending: true,
        meetingLog: log(action.timestamp, 'Chair: "Is there any objection?"')
      };

    case 'OBJECT_TO_CONSENT':
      return {
        ...state,
        unanimousConsentPending: false,
        meetingLog: log(action.timestamp, `${action.objector} objects. Motion requires a vote.`)
      };

    case 'UNANIMOUS_CONSENT_PASSED': {
      const newStack = state.motionStack.slice(0, -1);
      const outcome = applyMotionOutcome(state);

      return {
        ...state,
        unanimousConsentPending: false,
        currentMotion: newStack[newStack.length - 1] || null,
        motionStack: newStack,
        ...outcome,
        meetingLog: log(action.timestamp, `Motion CARRIED by unanimous consent.`)
      };
    }

    case 'SET_VOTING_METHOD':
      return { ...state, votingMethod: action.method };

    case 'ADVANCE_MEETING_STAGE': {
      const stageOrder: Array<typeof state.meetingStage> = [
        'not-started',
        'call-to-order',
        'minutes-approval',
        'reports',
        'special-orders',
        'unfinished-business',
        'new-business',
        'announcements',
        'adjourned'
      ];
      const currentIndex = stageOrder.indexOf(state.meetingStage);
      const nextStage = stageOrder[Math.min(currentIndex + 1, stageOrder.length - 1)];

      const stageMessages: Record<typeof nextStage, string> = {
        'not-started': '',
        'call-to-order': 'Meeting called to order',
        'minutes-approval': 'Reading and approval of minutes',
        'reports': 'Reports of officers and committees',
        'special-orders': 'Special orders',
        'unfinished-business': 'Unfinished business and general orders',
        'new-business': 'New business',
        'announcements': 'Announcements',
        'adjourned': 'Meeting adjourned'
      };

      return {
        ...state,
        meetingStage: nextStage,
        meetingLog: stageMessages[nextStage] ? log(action.timestamp, stageMessages[nextStage]) : state.meetingLog
      };
    }

    case 'APPROVE_MINUTES':
      return {
        ...state,
        minutesApproved: true,
        meetingLog: log(action.timestamp, "Minutes from previous meeting approved.")
      };

    case 'SET_PREVIOUS_MINUTES':
      return {
        ...state,
        minutesFromPreviousMeeting: action.minutes
      };

    default:
      return state;
  }
}
