import React, { useState, useReducer, useEffect } from 'react';
import { Users, Gavel, Settings, Hand, X, ChevronRight, AlertCircle, Vote, MessageSquare, HelpCircle, Info, CheckCircle, XCircle, Clock, Timer } from 'lucide-react';

const MOTIONS = {
  fixTimeAdjourn: { name: "Fix Time to Adjourn", precedence: 13, category: "privileged", interrupt: false, needsSecond: true, debatable: false, amendable: true, reconsidered: false, vote: "majority", phrase: "I move that when we adjourn, we adjourn to meet at...", help: "Sets the time for the next meeting.", whenToUse: "When you need to ensure the group meets again at a specific time." },
  adjourn: { name: "Adjourn", precedence: 12, category: "privileged", interrupt: false, needsSecond: true, debatable: false, amendable: false, reconsidered: true, vote: "majority", phrase: "I move that we adjourn.", help: "Ends the meeting immediately.", whenToUse: "When business is complete or continuing would be unproductive." },
  recess: { name: "Recess", precedence: 11, category: "privileged", interrupt: false, needsSecond: true, debatable: false, amendable: true, reconsidered: false, vote: "majority", phrase: "I move that we recess for [time period].", help: "Takes a short break. The meeting resumes where it left off.", whenToUse: "When members need a break." },
  questionPrivilege: { name: "Question of Privilege", precedence: 10, category: "privileged", interrupt: true, needsSecond: false, debatable: false, amendable: false, reconsidered: false, vote: "none", phrase: "I rise to a question of privilege.", help: "Raises an urgent matter affecting the assembly or a member.", whenToUse: "When something is interfering with the meeting." },
  callOrderDay: { name: "Call for Orders of the Day", precedence: 9, category: "privileged", interrupt: true, needsSecond: false, debatable: false, amendable: false, reconsidered: false, vote: "none", phrase: "I call for the orders of the day.", help: "Demands that the assembly follow the agenda.", whenToUse: "When the meeting has strayed from the agenda." },
  appeal: { name: "Appeal the Chair's Decision", precedence: 0, category: "incidental", interrupt: true, needsSecond: true, debatable: true, amendable: false, reconsidered: true, vote: "majority", phrase: "I appeal from the decision of the Chair.", help: "Challenges a ruling made by the Chair.", whenToUse: "When you believe the Chair made an incorrect ruling." },
  objectionConsideration: { name: "Objection to Consideration", precedence: 0, category: "incidental", interrupt: true, needsSecond: false, debatable: false, amendable: false, reconsidered: false, vote: "2/3", phrase: "I object to the consideration of this question.", help: "Blocks a main motion from being discussed.", whenToUse: "When a motion is inappropriate for the assembly to discuss." },
  pointInfo: { name: "Point of Information", precedence: 0, category: "incidental", interrupt: true, needsSecond: false, debatable: false, amendable: false, reconsidered: false, vote: "none", phrase: "Point of information: [your question]", help: "Asks a question about facts relevant to the current business.", whenToUse: "When you need factual clarification." },
  pointOrder: { name: "Point of Order", precedence: 0, category: "incidental", interrupt: true, needsSecond: false, debatable: false, amendable: false, reconsidered: false, vote: "none", phrase: "Point of order!", help: "Calls attention to a violation of the rules.", whenToUse: "When someone is violating the rules." },
  suspendRules: { name: "Suspend the Rules", precedence: 0, category: "incidental", interrupt: false, needsSecond: true, debatable: false, amendable: false, reconsidered: false, vote: "2/3", phrase: "I move to suspend the rules and...", help: "Temporarily sets aside procedural rules.", whenToUse: "When rules prevent something the assembly wants to do." },
  withdrawMotion: { name: "Withdraw a Motion", precedence: 0, category: "incidental", interrupt: false, needsSecond: false, debatable: false, amendable: false, reconsidered: false, vote: "none", phrase: "I ask permission to withdraw my motion.", help: "Allows the maker of a motion to take it back.", whenToUse: "When you no longer wish to pursue your motion." },
  division: { name: "Division (Verify Vote)", precedence: 0, category: "incidental", interrupt: true, needsSecond: false, debatable: false, amendable: false, reconsidered: false, vote: "none", phrase: "Division!", help: "Demands a more accurate vote count.", whenToUse: "When a voice vote was too close to call." },
  layOnTable: { name: "Lay on the Table", precedence: 8, category: "subsidiary", interrupt: false, needsSecond: true, debatable: false, amendable: false, reconsidered: true, vote: "majority", phrase: "I move to lay the question on the table.", help: "Temporarily sets aside the current motion.", whenToUse: "When urgent business must be addressed first." },
  previousQuestion: { name: "Previous Question (Close Debate)", precedence: 7, category: "subsidiary", interrupt: false, needsSecond: true, debatable: false, amendable: false, reconsidered: true, vote: "2/3", phrase: "I move the previous question.", help: "Ends debate immediately and forces a vote.", whenToUse: "When debate has gone on long enough." },
  limitDebate: { name: "Limit or Extend Debate", precedence: 6, category: "subsidiary", interrupt: false, needsSecond: true, debatable: false, amendable: true, reconsidered: true, vote: "2/3", phrase: "I move to limit debate to [time/speakers].", help: "Sets a time limit on debate.", whenToUse: "When debate is dragging on." },
  postponeDefinite: { name: "Postpone to a Definite Time", precedence: 5, category: "subsidiary", interrupt: false, needsSecond: true, debatable: true, amendable: true, reconsidered: true, vote: "majority", phrase: "I move to postpone this matter until [specific time].", help: "Delays consideration to a specific time.", whenToUse: "When you need more information or better timing." },
  referCommittee: { name: "Refer to Committee", precedence: 4, category: "subsidiary", interrupt: false, needsSecond: true, debatable: true, amendable: true, reconsidered: true, vote: "majority", phrase: "I move to refer this matter to [committee name].", help: "Sends the motion to a committee for study.", whenToUse: "When the matter needs more research." },
  amend: { name: "Amend", precedence: 3, category: "subsidiary", interrupt: false, needsSecond: true, debatable: true, amendable: true, reconsidered: true, vote: "majority", phrase: "I move to amend the motion by...", help: "Changes the wording of a pending motion.", whenToUse: "When you support the idea but want changes." },
  amendAmendment: { name: "Amend the Amendment", precedence: 2.5, category: "subsidiary", interrupt: false, needsSecond: true, debatable: true, amendable: false, reconsidered: true, vote: "majority", phrase: "I move to amend the amendment by...", help: "Changes a pending amendment. Cannot go deeper than this.", whenToUse: "When you want to modify a pending amendment." },
  postponeIndefinitely: { name: "Postpone Indefinitely", precedence: 2, category: "subsidiary", interrupt: false, needsSecond: true, debatable: true, amendable: false, reconsidered: true, vote: "majority", phrase: "I move to postpone the motion indefinitely.", help: "Kills the motion for the rest of the session.", whenToUse: "When you want to defeat a motion indirectly." },
  mainMotion: { name: "Main Motion", precedence: 1, category: "main", interrupt: false, needsSecond: true, debatable: true, amendable: true, reconsidered: true, vote: "majority", phrase: "I move that...", help: "Introduces new business for the assembly.", whenToUse: "When you want the assembly to take action." },
  takeFromTable: { name: "Take from the Table", precedence: 1, category: "main", interrupt: false, needsSecond: true, debatable: false, amendable: false, reconsidered: false, vote: "majority", phrase: "I move to take from the table the motion relating to...", help: "Brings back a tabled motion.", whenToUse: "When ready to resume a tabled motion." },
  reconsider: { name: "Reconsider", precedence: 1, category: "main", interrupt: true, needsSecond: true, debatable: true, amendable: false, reconsidered: false, vote: "majority", phrase: "I move to reconsider the vote on...", help: "Brings back a motion for another vote.", whenToUse: "When new information has emerged." },
  adoptAgenda: { name: "Adopt the Agenda", precedence: 1, category: "main", interrupt: false, needsSecond: true, debatable: true, amendable: true, reconsidered: true, vote: "majority", phrase: "I move to adopt the agenda as presented.", help: "Formally adopts the meeting agenda.", whenToUse: "When unanimous consent was not achieved." },
  amendAgenda: { name: "Amend the Agenda", precedence: 3, category: "subsidiary", interrupt: false, needsSecond: true, debatable: true, amendable: true, reconsidered: true, vote: "majority", phrase: "I move to amend the agenda by...", help: "Changes the proposed agenda before adoption.", whenToUse: "When you want to change the agenda." }
};

const CATEGORY_INFO = {
  privileged: { color: "purple", label: "Privileged" },
  incidental: { color: "amber", label: "Incidental" },
  subsidiary: { color: "blue", label: "Subsidiary" },
  main: { color: "emerald", label: "Main" }
};

const initialState = {
  meetingActive: false,
  meetingCode: "",
  members: [
    { id: 1, name: "Alice Johnson", role: "member", present: true },
    { id: 2, name: "Bob Smith", role: "member", present: true },
    { id: 3, name: "Carol Davis", role: "member", present: true },
    { id: 4, name: "David Wilson", role: "chair", present: true },
    { id: 5, name: "Eve Martinez", role: "admin", present: true },
  ],
  quorum: 3,
  motionStack: [],
  currentMotion: null,
  pendingSecond: null,
  votes: { yea: 0, nay: 0, abstain: 0 },
  voters: [],
  votingOpen: false,
  speakerQueue: [],
  recognizedSpeaker: null,
  speakerTimerEnd: null,
  voteTimerEnd: null,
  speakerTimeLimit: 120,
  voteTimeLimit: 60,
  meetingLog: [],
  agenda: [
    { id: 1, title: "Approve previous meeting minutes", status: "pending" },
    { id: 2, title: "Budget proposal for Q1", status: "pending" },
    { id: 3, title: "New member applications", status: "pending" },
  ],
  agendaAdopted: false,
  agendaObjection: false,
  currentAgendaItem: null,
  tabledMotions: [],
};

function reducer(state, action) {
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
    case 'OPEN_VOTING':
      return { ...state, votingOpen: true, votes: { yea: 0, nay: 0, abstain: 0 }, voters: [], meetingLog: log(`Chair puts the question: "${state.currentMotion?.text}"`) };
    case 'CAST_VOTE':
      if (state.voters.includes(action.oderId)) return state;
      const newVotes = { ...state.votes };
      newVotes[action.vote]++;
      return { ...state, votes: newVotes, voters: [...state.voters, action.oderId] };
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
      return { ...state, votingOpen: false, currentMotion: newStack[newStack.length - 1] || null, motionStack: newStack, tabledMotions, agendaAdopted, agendaObjection, agenda, meetingLog: log(`Vote: Yea ${yea}, Nay ${nay}. Motion ${passed ? "CARRIED" : "FAILED"}.`) };
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
    default:
      return state;
  }
}

function getValidMotions(state) {
  const currentPrecedence = state.currentMotion?.precedence || 0;
  const hasAmendment = state.motionStack.some(m => m.type === 'amend');
  const hasSecondaryAmendment = state.motionStack.some(m => m.type === 'amendAmendment');
  const isAgendaAdoptionPending = state.currentMotion?.type === 'adoptAgenda';
  const validMotions = [];
  
  if (!state.agendaAdopted && state.agendaObjection && !state.currentMotion) {
    return [{ key: 'adoptAgenda', ...MOTIONS.adoptAgenda }, { key: 'amendAgenda', ...MOTIONS.amendAgenda }];
  }
  if (isAgendaAdoptionPending) {
    validMotions.push({ key: 'amendAgenda', ...MOTIONS.amendAgenda });
  }
  Object.entries(MOTIONS).forEach(([key, motion]) => {
    if ((key === 'adoptAgenda' || key === 'amendAgenda') && state.agendaAdopted) return;
    if (key === 'adoptAgenda' && isAgendaAdoptionPending) return;
    if (key === 'mainMotion' && currentPrecedence > 0) return;
    if (key === 'amendAmendment' && (!hasAmendment || hasSecondaryAmendment)) return;
    if (key === 'amend' && state.currentMotion?.type === 'amendAmendment') return;
    if (motion.category === 'incidental' || motion.precedence > currentPrecedence) {
      validMotions.push({ key, ...motion });
    }
  });
  return validMotions;
}

function DraggableAgendaList({ agenda, dispatch, disabled, showStatus = false }) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  
  const handleDragStart = (e, index) => {
    if (disabled) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e, index) => {
    if (disabled) return;
    e.preventDefault();
    setDragOverIndex(index);
  };
  const handleDrop = (e, toIndex) => {
    if (disabled) return;
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== toIndex) {
      dispatch({ type: 'REORDER_AGENDA', fromIndex: draggedIndex, toIndex });
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };
  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };
  
  return (
    <ul className="space-y-2">
      {agenda.map((item, i) => (
        <li key={item.id} draggable={!disabled} onDragStart={(e) => handleDragStart(e, i)} onDragOver={(e) => handleDragOver(e, i)} onDrop={(e) => handleDrop(e, i)} onDragEnd={handleDragEnd}
          className={`flex items-center justify-between p-3 rounded-lg transition-all ${draggedIndex === i ? 'opacity-50 bg-gray-200' : 'bg-gray-50'} ${dragOverIndex === i && draggedIndex !== i ? 'border-t-2 border-indigo-500' : ''} ${!disabled ? 'cursor-grab' : ''} ${showStatus && item.status === 'completed' ? 'bg-green-50' : ''} ${showStatus && item.status === 'active' ? 'bg-indigo-50' : ''}`}>
          <div className="flex items-center gap-3">
            {!disabled && <span className="text-gray-400">⠿</span>}
            {showStatus && item.status === 'completed' && <CheckCircle size={16} className="text-green-600"/>}
            {showStatus && item.status === 'active' && <ChevronRight size={16} className="text-indigo-600"/>}
            <span className={showStatus && item.status === 'completed' ? 'line-through text-gray-400' : ''}>{i + 1}. {item.title}</span>
          </div>
          {!disabled && <button onClick={() => dispatch({ type: 'REMOVE_AGENDA_ITEM', id: item.id })} className="text-red-400 hover:text-red-600 p-1"><X size={18}/></button>}
        </li>
      ))}
    </ul>
  );
}

function AgendaAmendmentForm({ agenda, onSubmit, onCancel }) {
  const [amendmentType, setAmendmentType] = useState('add');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemPosition, setNewItemPosition] = useState('end');
  const [selectedItemId, setSelectedItemId] = useState(agenda[0]?.id || null);
  const [moveDirection, setMoveDirection] = useState('up');
  
  const handleSubmit = () => {
    let text = '';
    let agendaAmendment = null;
    if (amendmentType === 'add') {
      const positionText = newItemPosition === 'end' ? 'at the end' : newItemPosition === 'beginning' ? 'at the beginning' : `after item ${parseInt(newItemPosition) + 1}`;
      text = `Amend the agenda by adding "${newItemTitle}" ${positionText}`;
      agendaAmendment = { action: 'add', title: newItemTitle, position: newItemPosition === 'end' ? 'end' : newItemPosition === 'beginning' ? 'beginning' : parseInt(newItemPosition) + 1 };
    } else if (amendmentType === 'remove') {
      const item = agenda.find(a => a.id === selectedItemId);
      text = `Amend the agenda by removing "${item?.title}"`;
      agendaAmendment = { action: 'remove', itemId: selectedItemId };
    } else if (amendmentType === 'reorder') {
      const fromIndex = agenda.findIndex(a => a.id === selectedItemId);
      const toIndex = moveDirection === 'up' ? Math.max(0, fromIndex - 1) : Math.min(agenda.length - 1, fromIndex + 1);
      const item = agenda.find(a => a.id === selectedItemId);
      text = `Amend the agenda by moving "${item?.title}" ${moveDirection}`;
      agendaAmendment = { action: 'reorder', fromIndex, toIndex };
    }
    onSubmit(text, agendaAmendment);
  };
  
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Amendment Type</label>
        <div className="grid grid-cols-3 gap-2">
          {[{ value: 'add', label: 'Add', icon: '+' }, { value: 'remove', label: 'Remove', icon: '−' }, { value: 'reorder', label: 'Reorder', icon: '↕' }].map(opt => (
            <button key={opt.value} onClick={() => setAmendmentType(opt.value)} className={`p-3 rounded-lg border-2 text-center ${amendmentType === opt.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
              <span className="text-xl block">{opt.icon}</span>
              <span className="text-sm">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
      {amendmentType === 'add' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Item Title</label>
            <input type="text" value={newItemTitle} onChange={(e) => setNewItemTitle(e.target.value)} placeholder="Enter agenda item..." className="w-full p-3 border rounded-lg"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
            <select value={newItemPosition} onChange={(e) => setNewItemPosition(e.target.value)} className="w-full p-3 border rounded-lg bg-white">
              <option value="beginning">At the beginning</option>
              {agenda.map((item, i) => (<option key={item.id} value={i}>After: {item.title}</option>))}
              <option value="end">At the end</option>
            </select>
          </div>
        </>
      )}
      {amendmentType === 'remove' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Item to Remove</label>
          <select value={selectedItemId || ''} onChange={(e) => setSelectedItemId(parseInt(e.target.value))} className="w-full p-3 border rounded-lg bg-white">
            {agenda.map((item, i) => (<option key={item.id} value={item.id}>{i + 1}. {item.title}</option>))}
          </select>
        </div>
      )}
      {amendmentType === 'reorder' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Item to Move</label>
            <select value={selectedItemId || ''} onChange={(e) => setSelectedItemId(parseInt(e.target.value))} className="w-full p-3 border rounded-lg bg-white">
              {agenda.map((item, i) => (<option key={item.id} value={item.id}>{i + 1}. {item.title}</option>))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMoveDirection('up')} className={`p-3 rounded-lg border-2 ${moveDirection === 'up' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>↑ Move Up</button>
            <button onClick={() => setMoveDirection('down')} className={`p-3 rounded-lg border-2 ${moveDirection === 'down' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>↓ Move Down</button>
          </div>
        </>
      )}
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
        <button onClick={handleSubmit} disabled={amendmentType === 'add' && !newItemTitle.trim()} className="flex-1 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300 font-medium">Submit Motion</button>
      </div>
    </div>
  );
}

function HelpTooltip({ motion }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setShow(!show)} className="text-gray-400 hover:text-gray-600"><HelpCircle size={16}/></button>
      {show && (
        <div className="absolute z-50 left-0 top-6 w-72 bg-white border rounded-lg shadow-xl p-4 text-sm">
          <div className="flex justify-between mb-2">
            <span className="font-semibold">{motion.name}</span>
            <button onClick={() => setShow(false)} className="text-gray-400"><X size={14}/></button>
          </div>
          <p className="text-gray-600 mb-2">{motion.help}</p>
          <p className="text-gray-500 italic text-xs mb-2">"{motion.phrase}"</p>
          <p className="text-xs text-gray-600"><strong>When to use:</strong> {motion.whenToUse}</p>
          <div className="grid grid-cols-2 gap-1 mt-2 text-xs border-t pt-2">
            <span className={motion.needsSecond ? "text-green-600" : "text-gray-400"}>{motion.needsSecond ? <CheckCircle size={12} className="inline mr-1"/> : <XCircle size={12} className="inline mr-1"/>}Second</span>
            <span className={motion.debatable ? "text-green-600" : "text-gray-400"}>{motion.debatable ? <CheckCircle size={12} className="inline mr-1"/> : <XCircle size={12} className="inline mr-1"/>}Debatable</span>
            <span className={motion.amendable ? "text-green-600" : "text-gray-400"}>{motion.amendable ? <CheckCircle size={12} className="inline mr-1"/> : <XCircle size={12} className="inline mr-1"/>}Amendable</span>
            <span className="text-gray-700">Vote: {motion.vote === "2/3" ? "⅔" : motion.vote === "majority" ? "Majority" : "None"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MotionCard({ motion, showHelp = true }) {
  const cat = CATEGORY_INFO[motion.category];
  const colors = { purple: "bg-purple-50 border-purple-200 text-purple-700", amber: "bg-amber-50 border-amber-200 text-amber-700", blue: "bg-blue-50 border-blue-200 text-blue-700", emerald: "bg-emerald-50 border-emerald-200 text-emerald-700" };
  return (
    <div className={`p-3 rounded-lg border ${colors[cat.color]?.split(' ').slice(0,2).join(' ')}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`font-medium ${colors[cat.color]?.split(' ')[2]}`}>{motion.name}</span>
        {showHelp && <HelpTooltip motion={motion}/>}
      </div>
      <p className="text-gray-700">"{motion.text}"</p>
      {motion.agendaAmendment && (
        <div className="mt-2 p-2 bg-white rounded text-sm text-gray-600">
          {motion.agendaAmendment.action === 'add' && `➕ Adding: "${motion.agendaAmendment.title}"`}
          {motion.agendaAmendment.action === 'remove' && `➖ Removing item`}
          {motion.agendaAmendment.action === 'reorder' && `↕️ Reordering`}
        </div>
      )}
      <p className="text-sm text-gray-500 mt-1">Moved by {motion.mover}{motion.secondedBy && `, seconded by ${motion.secondedBy}`}</p>
    </div>
  );
}

function ParticipantView({ state, dispatch, currentUser }) {
  const [motionText, setMotionText] = useState("");
  const [selectedMotion, setSelectedMotion] = useState("mainMotion");
  const [showAgendaAmendForm, setShowAgendaAmendForm] = useState(false);
  const validMotions = getValidMotions(state);
  const selectedMotionDef = MOTIONS[selectedMotion];
  const handRaised = state.speakerQueue.find(s => s.id === currentUser.id);
  const hasFloor = state.recognizedSpeaker?.id === currentUser.id;
  
  useEffect(() => {
    if (!validMotions.find(m => m.key === selectedMotion) && validMotions.length > 0) {
      setSelectedMotion(validMotions[0].key);
    }
  }, [validMotions, selectedMotion]);
  
  const handleMotionSubmit = () => {
    if (selectedMotion === 'amendAgenda') {
      setShowAgendaAmendForm(true);
    } else {
      dispatch({ type: 'MAKE_MOTION', motionType: selectedMotion, text: motionText || selectedMotionDef?.phrase, mover: currentUser.name });
      setMotionText("");
    }
  };
  
  const handleAgendaAmendSubmit = (text, agendaAmendment) => {
    dispatch({ type: 'MAKE_MOTION', motionType: 'amendAgenda', text, mover: currentUser.name, agendaAmendment });
    setShowAgendaAmendForm(false);
  };
  
  return (
    <div className="space-y-4">
      {hasFloor && (
        <div className="bg-green-100 border border-green-300 rounded-lg p-3 flex items-center justify-between">
          <span className="text-green-800 font-medium">You have the floor</span>
          <button onClick={() => dispatch({ type: 'YIELD_FLOOR' })} className="text-green-700 text-sm underline">Yield</button>
        </div>
      )}
      
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><MessageSquare size={18}/> Current Business</h3>
        
        {state.currentAgendaItem && !state.currentMotion && !state.pendingSecond && (
          <div className="mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <p className="text-xs text-indigo-600 uppercase mb-1">Agenda Item</p>
            <p className="font-medium text-indigo-900">{state.currentAgendaItem.title}</p>
          </div>
        )}
        
        {state.meetingActive && !state.agendaAdopted && !state.agendaObjection && !state.pendingSecond && (
          <div className="text-center py-6 text-gray-500">
            <Info size={24} className="mx-auto mb-2 opacity-50"/>
            <p>Waiting for agenda adoption</p>
          </div>
        )}
        
        {state.meetingActive && !state.agendaAdopted && state.agendaObjection && !state.currentMotion && !state.pendingSecond && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-amber-800 font-medium mb-1">Objection to Agenda</p>
            <p className="text-amber-700 text-sm">A motion to adopt or amend the agenda is in order.</p>
          </div>
        )}
        
        {state.pendingSecond ? (
          <div className="space-y-3">
            {state.motionStack.length > 0 && (
              <div className="mb-2">
                <p className="text-xs text-gray-500 uppercase mb-1">Pending Question</p>
                <MotionCard motion={state.motionStack[state.motionStack.length - 1]}/>
              </div>
            )}
            <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
              <p className="text-amber-800 font-semibold mb-2 flex items-center gap-2"><AlertCircle size={18}/> Awaiting Second</p>
              <p className="text-gray-800">"{state.pendingSecond.text}"</p>
              <p className="text-sm text-gray-600 mt-1">{state.pendingSecond.name} by {state.pendingSecond.mover}</p>
            </div>
            {state.pendingSecond.mover !== currentUser.name && (
              <button onClick={() => dispatch({ type: 'SECOND_MOTION', seconder: currentUser.name })} className="w-full bg-amber-500 text-white py-3 rounded-lg hover:bg-amber-600 font-semibold text-lg">I Second This Motion</button>
            )}
          </div>
        ) : state.currentMotion ? (
          <MotionCard motion={state.currentMotion}/>
        ) : state.agendaAdopted && !state.currentAgendaItem ? (
          <div className="text-center py-6 text-gray-500">
            <Info size={24} className="mx-auto mb-2 opacity-50"/>
            <p>Waiting for Chair to call next item</p>
          </div>
        ) : !state.meetingActive ? (
          <div className="text-center py-6 text-gray-500">
            <Info size={24} className="mx-auto mb-2 opacity-50"/>
            <p>Meeting not started</p>
          </div>
        ) : null}
      </div>
      
      {state.votingOpen && (
        <div className="bg-white rounded-lg p-4 shadow border-2 border-indigo-200">
          <h3 className="font-semibold mb-2 flex items-center gap-2 text-indigo-700"><Vote size={18}/> Vote Now</h3>
          <p className="text-gray-700 mb-2">"{state.currentMotion?.text}"</p>
          <p className="text-sm text-gray-500 mb-4">Requires: {state.currentMotion?.vote === "2/3" ? "Two-thirds" : "Majority"}</p>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'yea', oderId: currentUser.id })} disabled={state.voters.includes(currentUser.id)} className="bg-green-500 text-white py-4 rounded-lg font-bold text-lg disabled:opacity-50">YEA</button>
            <button onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'nay', oderId: currentUser.id })} disabled={state.voters.includes(currentUser.id)} className="bg-red-500 text-white py-4 rounded-lg font-bold text-lg disabled:opacity-50">NAY</button>
            <button onClick={() => dispatch({ type: 'CAST_VOTE', vote: 'abstain', oderId: currentUser.id })} disabled={state.voters.includes(currentUser.id)} className="bg-gray-400 text-white py-4 rounded-lg font-bold disabled:opacity-50">ABSTAIN</button>
          </div>
          {state.voters.includes(currentUser.id) && <p className="text-center text-green-600 mt-3 font-medium">Vote recorded</p>}
        </div>
      )}
      
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><Hand size={18}/> Seek Recognition</h3>
        <button onClick={() => dispatch({ type: handRaised ? 'LOWER_HAND' : 'RAISE_HAND', member: currentUser })} className={`w-full py-3 rounded-lg font-medium ${handRaised ? 'bg-amber-100 text-amber-700 border-2 border-amber-300' : 'bg-blue-500 text-white'}`}>
          {handRaised ? "✋ Hand Raised (tap to lower)" : "Raise Hand to Speak"}
        </button>
      </div>
      
      {state.agendaAdopted && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Agenda</h3>
          <ul className="space-y-2">
            {state.agenda.map((item, i) => (
              <li key={item.id} className={`flex items-center gap-2 p-2 rounded ${item.status === 'completed' ? 'bg-green-50 text-gray-500' : item.status === 'active' ? 'bg-indigo-100 font-medium' : ''}`}>
                {item.status === 'completed' && <CheckCircle size={16} className="text-green-600"/>}
                {item.status === 'active' && <ChevronRight size={16} className="text-indigo-600"/>}
                <span className={item.status === 'completed' ? 'line-through' : ''}>{i + 1}. {item.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {!state.votingOpen && !state.pendingSecond && (state.agendaAdopted || state.agendaObjection) && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Make a Motion</h3>
          {showAgendaAmendForm ? (
            <AgendaAmendmentForm agenda={state.agenda} onSubmit={handleAgendaAmendSubmit} onCancel={() => setShowAgendaAmendForm(false)}/>
          ) : (
            <>
              <select value={selectedMotion} onChange={(e) => setSelectedMotion(e.target.value)} className="w-full p-3 border rounded-lg mb-3 bg-white">
                {Object.entries(validMotions.reduce((acc, m) => { if (!acc[m.category]) acc[m.category] = []; acc[m.category].push(m); return acc; }, {})).map(([cat, motions]) => (
                  <optgroup key={cat} label={CATEGORY_INFO[cat].label + " Motions"}>
                    {motions.map(m => <option key={m.key} value={m.key}>{m.name}</option>)}
                  </optgroup>
                ))}
              </select>
              {selectedMotionDef && (
                <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm">
                  <div className="flex items-start gap-2">
                    <HelpTooltip motion={selectedMotionDef}/>
                    <div>
                      <p className="text-gray-700">{selectedMotionDef.help}</p>
                      <p className="text-gray-500 italic mt-1">"{selectedMotionDef.phrase}"</p>
                    </div>
                  </div>
                </div>
              )}
              {selectedMotion !== 'amendAgenda' && (
                <input type="text" placeholder={selectedMotionDef?.phrase || "I move that..."} value={motionText} onChange={(e) => setMotionText(e.target.value)} className="w-full p-3 border rounded-lg mb-3"/>
              )}
              <button onClick={handleMotionSubmit} disabled={selectedMotion !== 'amendAgenda' && !motionText.trim() && !selectedMotionDef?.phrase} className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 font-medium">
                {selectedMotion === 'amendAgenda' ? 'Configure Amendment...' : 'Submit Motion'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ChairView({ state, dispatch }) {
  const [showScript, setShowScript] = useState(true);
  const [newAgendaItem, setNewAgendaItem] = useState("");
  
  const getChairScript = () => {
    if (!state.meetingActive) return null;
    if (!state.agendaAdopted && !state.agendaObjection && !state.currentMotion && !state.pendingSecond) return { text: '"Is there any objection to adopting the agenda?"', note: "If none, click 'No Objection'. If someone objects, click 'Objection Raised'." };
    if (!state.agendaAdopted && state.agendaObjection && !state.currentMotion && !state.pendingSecond) return { text: '"There has been an objection. A motion to adopt the agenda is in order."', note: "Wait for a member to move." };
    if (state.pendingSecond) return { text: '"Is there a second?"', note: "Wait for a second or declare no second." };
    if (state.votingOpen) return { text: '"Those in favor say Aye. Those opposed say No."', note: "Close voting when done." };
    if (state.currentMotion) return { text: state.currentMotion.debatable ? `"Is there any discussion on: ${state.currentMotion.text}?"` : '"This motion is not debatable."', note: state.currentMotion.debatable ? "Recognize speakers, then call the question." : "Proceed to vote." };
    if (state.currentAgendaItem) return { text: `"We are now on: ${state.currentAgendaItem.title}"`, note: "Allow discussion or motions." };
    if (state.agendaAdopted) {
      const next = state.agenda.find(a => a.status === "pending");
      return next ? { text: '"We will proceed to the next item."', note: `Next: "${next.title}"` } : { text: '"Is there any new business?"', note: "If none, entertain motion to adjourn." };
    }
    return { text: '"Is there any business?"', note: "" };
  };
  
  const script = getChairScript();
  
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><Gavel size={18}/> Meeting Control</h3>
        {!state.meetingActive ? (
          <button onClick={() => dispatch({ type: 'START_MEETING' })} className="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 font-medium">Call Meeting to Order</button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <span className="text-green-700 font-medium">Meeting in Progress</span>
              <span className="text-green-600 font-mono">{state.meetingCode}</span>
            </div>
            <button onClick={() => dispatch({ type: 'END_MEETING' })} className="w-full bg-red-500 text-white py-2 rounded-lg hover:bg-red-600">Adjourn</button>
          </div>
        )}
      </div>
      
      {script && showScript && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <div className="flex justify-between">
            <div>
              <p className="text-indigo-800 font-medium mb-1">Say:</p>
              <p className="text-indigo-900 text-lg">{script.text}</p>
              <p className="text-indigo-600 text-sm mt-2 italic">{script.note}</p>
            </div>
            <button onClick={() => setShowScript(false)} className="text-indigo-400"><X size={18}/></button>
          </div>
        </div>
      )}
      {!showScript && <button onClick={() => setShowScript(true)} className="text-indigo-600 text-sm">Show script</button>}
      
      {state.meetingActive && !state.agendaAdopted && !state.currentMotion && !state.pendingSecond && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">{state.agendaObjection ? "Agenda (Objection)" : "Adopt Agenda"}</h3>
          <p className="text-sm text-gray-600 mb-3">Drag items to reorder before adoption.</p>
          <DraggableAgendaList agenda={state.agenda} dispatch={dispatch} disabled={false}/>
          <div className="flex gap-2 my-3">
            <input type="text" value={newAgendaItem} onChange={(e) => setNewAgendaItem(e.target.value)} placeholder="Add item..." className="flex-1 p-2 border rounded-lg text-sm"/>
            <button onClick={() => { dispatch({ type: 'ADD_AGENDA_ITEM', title: newAgendaItem }); setNewAgendaItem(""); }} disabled={!newAgendaItem.trim()} className="bg-gray-200 text-gray-700 px-4 rounded-lg disabled:opacity-50 text-sm">Add</button>
          </div>
          {!state.agendaObjection ? (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => dispatch({ type: 'ADOPT_AGENDA' })} className="bg-green-500 text-white py-3 rounded-lg font-medium">No Objection</button>
              <button onClick={() => dispatch({ type: 'AGENDA_OBJECTION' })} className="bg-amber-500 text-white py-3 rounded-lg font-medium">Objection Raised</button>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
              <strong>Objection noted.</strong> A member must move to adopt or amend the agenda.
            </div>
          )}
        </div>
      )}
      
      {state.pendingSecond && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-2 text-amber-700">Awaiting Second</h3>
          <MotionCard motion={state.pendingSecond}/>
          <button onClick={() => dispatch({ type: 'DECLINE_SECOND' })} className="mt-3 w-full bg-gray-200 text-gray-700 py-2 rounded-lg">Declare "No Second"</button>
        </div>
      )}
      
      {state.currentMotion && !state.votingOpen && !state.pendingSecond && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Pending Motion</h3>
          <MotionCard motion={state.currentMotion}/>
          <button onClick={() => dispatch({ type: 'OPEN_VOTING' })} className="mt-4 w-full bg-indigo-600 text-white py-3 rounded-lg font-medium">Call the Question</button>
        </div>
      )}
      
      {state.votingOpen && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Voting</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-green-100 p-4 rounded-lg text-center"><p className="text-3xl font-bold text-green-700">{state.votes.yea}</p><p className="text-green-600">Yea</p></div>
            <div className="bg-red-100 p-4 rounded-lg text-center"><p className="text-3xl font-bold text-red-700">{state.votes.nay}</p><p className="text-red-600">Nay</p></div>
            <div className="bg-gray-100 p-4 rounded-lg text-center"><p className="text-3xl font-bold text-gray-700">{state.votes.abstain}</p><p className="text-gray-600">Abstain</p></div>
          </div>
          <button onClick={() => dispatch({ type: 'CLOSE_VOTING' })} className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium">Close & Announce</button>
        </div>
      )}
      
      {state.agendaAdopted && state.currentAgendaItem && !state.currentMotion && !state.pendingSecond && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-2 text-gray-800">Current Item</h3>
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-3 font-medium text-indigo-900">{state.currentAgendaItem.title}</div>
          <button onClick={() => dispatch({ type: 'COMPLETE_AGENDA_ITEM', id: state.currentAgendaItem.id })} className="w-full bg-green-500 text-white py-2 rounded-lg">Mark Complete</button>
        </div>
      )}
      
      {state.agendaAdopted && !state.currentAgendaItem && !state.currentMotion && !state.pendingSecond && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Agenda</h3>
          <ul className="space-y-2">
            {state.agenda.map((item, i) => (
              <li key={item.id} className={`flex items-center justify-between p-3 rounded-lg ${item.status === 'completed' ? 'bg-green-50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                  {item.status === 'completed' && <CheckCircle size={16} className="text-green-600"/>}
                  <span className={item.status === 'completed' ? 'line-through text-gray-400' : ''}>{i + 1}. {item.title}</span>
                </div>
                {item.status === 'pending' && <button onClick={() => dispatch({ type: 'CALL_AGENDA_ITEM', id: item.id })} className="bg-indigo-500 text-white px-3 py-1 rounded text-sm">Call</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><Hand size={18}/> Speaker Queue <span className="bg-gray-200 text-gray-700 text-sm px-2 py-0.5 rounded-full">{state.speakerQueue.length}</span></h3>
        {state.recognizedSpeaker && <div className="mb-3 p-3 bg-green-100 rounded-lg text-green-800"><strong>{state.recognizedSpeaker.name}</strong> has the floor</div>}
        {state.speakerQueue.length === 0 ? <p className="text-gray-500 text-center py-4">No one waiting</p> : (
          <ul className="space-y-2">
            {state.speakerQueue.map((m, i) => (
              <li key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span>{i + 1}. {m.name}</span>
                <button onClick={() => dispatch({ type: 'RECOGNIZE_SPEAKER', member: m })} className="bg-blue-500 text-white px-4 py-1 rounded text-sm">Recognize</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      
      {state.motionStack.length > 0 && (
        <div className="bg-white rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-800">Motion Stack</h3>
          <ul className="space-y-2">
            {[...state.motionStack].reverse().map((m, i) => (
              <li key={m.id} className={`text-sm p-3 rounded-lg ${i === 0 ? 'bg-indigo-100 border-2 border-indigo-300' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2">{i === 0 && <ChevronRight size={16} className="text-indigo-600"/>}<span className="font-medium">{m.name}</span></div>
                <p className="text-gray-600 ml-6">"{m.text}"</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AdminView({ state, dispatch }) {
  const [newItem, setNewItem] = useState("");
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><Settings size={18}/> Meeting Settings</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg"><p className="text-gray-500 text-sm">Quorum</p><p className="font-semibold text-lg">{state.quorum}</p></div>
          <div className="p-3 bg-gray-50 rounded-lg"><p className="text-gray-500 text-sm">Present</p><p className="font-semibold text-lg">{state.members.filter(m => m.present).length} / {state.members.length}</p></div>
        </div>
        <div className={`mt-3 p-3 rounded-lg ${state.members.filter(m => m.present).length >= state.quorum ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {state.members.filter(m => m.present).length >= state.quorum ? '✓ Quorum present' : '✗ No quorum'}
        </div>
      </div>
      
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800"><Users size={18}/> Members</h3>
        <ul className="space-y-2">
          {state.members.map(m => (
            <li key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="font-medium">{m.name}</span>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${m.role === 'chair' ? 'bg-purple-100 text-purple-800' : m.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-700'}`}>{m.role}</span>
            </li>
          ))}
        </ul>
      </div>
      
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 text-gray-800">Agenda {!state.agendaAdopted && "(Pending)"}</h3>
        {!state.agendaAdopted && <p className="text-sm text-amber-600 mb-3">Drag to reorder before adoption.</p>}
        <DraggableAgendaList agenda={state.agenda} dispatch={dispatch} disabled={state.agendaAdopted} showStatus={state.agendaAdopted}/>
        {!state.agendaAdopted && (
          <div className="flex gap-2 mt-3">
            <input type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="New item" className="flex-1 p-3 border rounded-lg"/>
            <button onClick={() => { dispatch({ type: 'ADD_AGENDA_ITEM', title: newItem }); setNewItem(""); }} disabled={!newItem.trim()} className="bg-indigo-600 text-white px-6 rounded-lg disabled:bg-gray-300">Add</button>
          </div>
        )}
        {state.agendaAdopted && <p className="text-xs text-gray-500 mt-3">Adopted. Changes require a motion.</p>}
      </div>
      
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 text-gray-800">Meeting Log</h3>
        <div className="max-h-64 overflow-y-auto bg-gray-50 rounded-lg p-3">
          {state.meetingLog.length === 0 ? <p className="text-gray-500 text-center py-4">Not started</p> : (
            <ul className="space-y-1 text-sm font-mono">
              {state.meetingLog.map((e, i) => <li key={i} className="text-gray-700"><span className="text-gray-400">[{e.time}]</span> {e.message}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [view, setView] = useState("participant");
  const [currentUser, setCurrentUser] = useState(initialState.members[0]);
  
  const tabs = [{ id: "participant", label: "Member", icon: Users }, { id: "chair", label: "Chair", icon: Gavel }, { id: "admin", label: "Admin", icon: Settings }];
  
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gradient-to-r from-indigo-700 to-indigo-800 text-white p-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg"><Gavel size={24}/></div>
          <div><h1 className="text-xl font-bold">Parliamentary Procedure</h1><p className="text-indigo-200 text-sm">Robert's Rules of Order</p></div>
        </div>
      </header>
      
      <div className="p-4 max-w-lg mx-auto">
        <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 shadow">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setView(tab.id)} className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 ${view === tab.id ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
              <tab.icon size={18}/>{tab.label}
            </button>
          ))}
        </div>
        
        {view === "participant" && (
          <div className="mb-4 bg-white rounded-lg p-3 shadow flex items-center gap-3">
            <span className="text-gray-600">Acting as:</span>
            <select value={currentUser.id} onChange={(e) => setCurrentUser(state.members.find(m => m.id === parseInt(e.target.value)))} className="flex-1 p-2 border rounded-lg bg-white">
              {state.members.filter(m => m.role === 'member').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}
        
        {!state.meetingActive && view !== "chair" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-center">
            <AlertCircle size={24} className="mx-auto mb-2 text-amber-500"/>
            <p className="text-amber-800 font-medium">Meeting not started</p>
            <p className="text-amber-600 text-sm">Waiting for Chair</p>
          </div>
        )}
        
        {view === "participant" && <ParticipantView state={state} dispatch={dispatch} currentUser={currentUser}/>}
        {view === "chair" && <ChairView state={state} dispatch={dispatch}/>}
        {view === "admin" && <AdminView state={state} dispatch={dispatch}/>}
      </div>
    </div>
  );
}
