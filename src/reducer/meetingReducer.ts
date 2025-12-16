import { MOTIONS } from '../constants/motions';

export function meetingReducer(state, action) {
  const log = (msg) => [...state.meetingLog, { time: new Date().toLocaleTimeString(), message: msg }];

  switch (action.type) {
    case 'START_MEETING':
      return { ...state, meetingActive: true, meetingCode: Math.random().toString(36).substring(2, 8).toUpperCase(), meetingLog: log("Meeting called to order.") };

    case 'END_MEETING':
      return { ...state, meetingActive: false, meetingLog: log("Meeting adjourned.") };

    case 'MAKE_MOTION': {
      const motionDef = MOTIONS[action.motionType];
      const motion = { ...motionDef, id: Date.now(), type: action.motionType, text: action.text, mover: action.mover, secondedBy: null, status: "pending", isAgendaAdoption: action.motionType === 'adoptAgenda', agendaAmendment: action.agendaAmendment || null };
      if (motion.needsSecond) {
        return { ...state, pendingSecond: motion, meetingLog: log(`${action.mover} moves: "${action.text}" (${motion.name}). Awaiting second.`) };
      }
      return { ...state, currentMotion: motion, motionStack: [...state.motionStack, motion], meetingLog: log(`${action.mover} raises ${motion.name}.`) };
    }

    case 'SECOND_MOTION':
      if (!state.pendingSecond) return state;
      const seconded = { ...state.pendingSecond, secondedBy: action.seconder, status: "active" };
      return { ...state, pendingSecond: null, currentMotion: seconded, motionStack: [...state.motionStack, seconded], meetingLog: log(`${action.seconder} seconds the motion.`) };

    case 'DECLINE_SECOND':
      return { ...state, pendingSecond: null, meetingLog: log("Motion fails for lack of a second.") };

    case 'OPEN_VOTING': {
      const timerEnd = state.voteTimeLimit > 0 ? Date.now() + state.voteTimeLimit * 1000 : null;
      return { ...state, votingOpen: true, voteTimerEnd: timerEnd, votes: { yea: 0, nay: 0, abstain: 0 }, voters: [], meetingLog: log(`Chair puts the question: "${state.currentMotion?.text}"`) };
    }

    case 'CAST_VOTE':
      if (state.voters.includes(action.voterId)) return state;
      const newVotes = { ...state.votes };
      newVotes[action.vote]++;
      return { ...state, votes: newVotes, voters: [...state.voters, action.voterId] };

    case 'CLOSE_VOTING': {
      const { yea, nay } = state.votes;
      const total = yea + nay;
      const threshold = state.currentMotion?.vote === "2/3" ? total * 2/3 : total / 2;
      const passed = yea > threshold;
      const newStack = state.motionStack.slice(0, -1);
      let tabledMotions = state.tabledMotions;
      let agendaAdopted = state.agendaAdopted;
      let agendaObjection = state.agendaObjection;
      let agenda = state.agenda;

      if (passed && state.currentMotion?.type === 'layOnTable') {
        const mainMotion = newStack.find(m => m.category === 'main');
        if (mainMotion) tabledMotions = [...tabledMotions, mainMotion];
      }
      if (passed && state.currentMotion?.isAgendaAdoption) {
        agendaAdopted = true;
        agendaObjection = false;
      }
      if (passed && state.currentMotion?.agendaAmendment) {
        const amendment = state.currentMotion.agendaAmendment;
        if (amendment.action === 'add') {
          const newItem = { id: Date.now(), title: amendment.title, status: "pending" };
          if (amendment.position === 'end') agenda = [...agenda, newItem];
          else if (amendment.position === 'beginning') agenda = [newItem, ...agenda];
          else if (typeof amendment.position === 'number') agenda = [...agenda.slice(0, amendment.position), newItem, ...agenda.slice(amendment.position)];
        } else if (amendment.action === 'remove') {
          agenda = agenda.filter(item => item.id !== amendment.itemId);
        } else if (amendment.action === 'reorder') {
          const newAgenda = [...agenda];
          const [moved] = newAgenda.splice(amendment.fromIndex, 1);
          newAgenda.splice(amendment.toIndex, 0, moved);
          agenda = newAgenda;
        }
      }

      return { ...state, votingOpen: false, voteTimerEnd: null, currentMotion: newStack[newStack.length - 1] || null, motionStack: newStack, tabledMotions, agendaAdopted, agendaObjection, agenda, meetingLog: log(`Vote: Yea ${yea}, Nay ${nay}. Motion ${passed ? "CARRIED" : "FAILED"}.`) };
    }

    case 'RAISE_HAND':
      if (state.speakerQueue.find(s => s.id === action.member.id)) return state;
      return { ...state, speakerQueue: [...state.speakerQueue, action.member] };

    case 'LOWER_HAND':
      return { ...state, speakerQueue: state.speakerQueue.filter(s => s.id !== action.member.id) };

    case 'RECOGNIZE_SPEAKER': {
      const timerEnd = state.speakerTimeLimit > 0 ? Date.now() + state.speakerTimeLimit * 1000 : null;
      return { ...state, recognizedSpeaker: action.member, speakerTimerEnd: timerEnd, speakerQueue: state.speakerQueue.filter(s => s.id !== action.member.id), meetingLog: log(`Chair recognizes ${action.member.name}.`) };
    }

    case 'YIELD_FLOOR':
      return { ...state, recognizedSpeaker: null, speakerTimerEnd: null, meetingLog: log(`${state.recognizedSpeaker?.name} yields the floor.`) };

    case 'ADD_AGENDA_ITEM':
      return { ...state, agenda: [...state.agenda, { id: Date.now(), title: action.title, status: "pending" }] };

    case 'REMOVE_AGENDA_ITEM':
      return { ...state, agenda: state.agenda.filter(a => a.id !== action.id) };

    case 'ADOPT_AGENDA':
      return { ...state, agendaAdopted: true, agendaObjection: false, meetingLog: log("Agenda adopted by unanimous consent.") };

    case 'AGENDA_OBJECTION':
      return { ...state, agendaObjection: true, meetingLog: log("Objection raised to agenda.") };

    case 'CALL_AGENDA_ITEM': {
      const item = state.agenda.find(a => a.id === action.id);
      const updatedAgenda = state.agenda.map(a => a.id === action.id ? { ...a, status: "active" } : a.status === "active" ? { ...a, status: "pending" } : a);
      return { ...state, currentAgendaItem: item, agenda: updatedAgenda, meetingLog: log(`Chair calls: "${item.title}"`) };
    }

    case 'COMPLETE_AGENDA_ITEM': {
      const updatedAgenda = state.agenda.map(a => a.id === action.id ? { ...a, status: "completed" } : a);
      return { ...state, currentAgendaItem: null, agenda: updatedAgenda, meetingLog: log(`Completed: "${state.currentAgendaItem?.title}"`) };
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
      return { ...state, unanimousConsentPending: true, meetingLog: log('Chair: "Is there any objection?"') };

    case 'OBJECT_TO_CONSENT':
      return { ...state, unanimousConsentPending: false, meetingLog: log(`${action.objector} objects. Motion requires a vote.`) };

    case 'UNANIMOUS_CONSENT_PASSED': {
      const newStack = state.motionStack.slice(0, -1);
      let tabledMotions = state.tabledMotions;
      let agendaAdopted = state.agendaAdopted;
      let agendaObjection = state.agendaObjection;
      let agenda = state.agenda;

      if (state.currentMotion?.type === 'layOnTable') {
        const mainMotion = newStack.find(m => m.category === 'main');
        if (mainMotion) tabledMotions = [...tabledMotions, mainMotion];
      }
      if (state.currentMotion?.isAgendaAdoption) {
        agendaAdopted = true;
        agendaObjection = false;
      }
      if (state.currentMotion?.agendaAmendment) {
        const amendment = state.currentMotion.agendaAmendment;
        if (amendment.action === 'add') {
          const newItem = { id: Date.now(), title: amendment.title, status: "pending" };
          if (amendment.position === 'end') agenda = [...agenda, newItem];
          else if (amendment.position === 'beginning') agenda = [newItem, ...agenda];
          else if (typeof amendment.position === 'number') agenda = [...agenda.slice(0, amendment.position), newItem, ...agenda.slice(amendment.position)];
        } else if (amendment.action === 'remove') {
          agenda = agenda.filter(item => item.id !== amendment.itemId);
        } else if (amendment.action === 'reorder') {
          const newAgenda = [...agenda];
          const [moved] = newAgenda.splice(amendment.fromIndex, 1);
          newAgenda.splice(amendment.toIndex, 0, moved);
          agenda = newAgenda;
        }
      }

      return {
        ...state,
        unanimousConsentPending: false,
        currentMotion: newStack[newStack.length - 1] || null,
        motionStack: newStack,
        tabledMotions,
        agendaAdopted,
        agendaObjection,
        agenda,
        meetingLog: log(`Motion CARRIED by unanimous consent.`)
      };
    }

    case 'SET_VOTING_METHOD':
      return { ...state, votingMethod: action.method };

    default:
      return state;
  }
}
