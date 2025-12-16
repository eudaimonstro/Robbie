// Member and Meeting types
export interface Member {
  id: number;
  name: string;
  role: 'member' | 'chair' | 'admin';
  present: boolean;
}

export interface AgendaItem {
  id: number;
  title: string;
  status: 'pending' | 'active' | 'completed';
}

export interface Motion {
  id: number;
  type: string;
  name: string;
  text: string;
  mover: string;
  secondedBy: string | null;
  status: 'pending' | 'active';
  precedence: number;
  category: 'privileged' | 'incidental' | 'subsidiary' | 'main';
  interrupt: boolean;
  needsSecond: boolean;
  debatable: boolean;
  amendable: boolean;
  reconsidered: boolean;
  vote: 'majority' | '2/3' | 'none';
  phrase: string;
  help: string;
  whenToUse: string;
  isAgendaAdoption?: boolean;
  agendaAmendment?: AgendaAmendment | null;
}

export interface AgendaAmendment {
  action: 'add' | 'remove' | 'reorder';
  title?: string;
  position?: 'beginning' | 'end' | number;
  itemId?: number;
  fromIndex?: number;
  toIndex?: number;
}

export interface MeetingLogEntry {
  time: string;
  message: string;
}

export interface Votes {
  yea: number;
  nay: number;
  abstain: number;
}

export type VotingMethod = 'voice' | 'rising' | 'standard' | 'ballot' | 'rollcall';

// State type
export interface MeetingState {
  meetingActive: boolean;
  meetingCode: string;
  members: Member[];
  quorum: number;
  motionStack: Motion[];
  currentMotion: Motion | null;
  pendingSecond: Motion | null;
  votes: Votes;
  voters: number[];
  votingOpen: boolean;
  votingMethod: VotingMethod;
  unanimousConsentPending: boolean;
  speakerQueue: Member[];
  recognizedSpeaker: Member | null;
  speakerTimerEnd: number | null;
  voteTimerEnd: number | null;
  speakerTimeLimit: number;
  voteTimeLimit: number;
  meetingLog: MeetingLogEntry[];
  agenda: AgendaItem[];
  agendaAdopted: boolean;
  agendaObjection: boolean;
  currentAgendaItem: AgendaItem | null;
  tabledMotions: Motion[];
}

// Action types
export type MeetingAction =
  | { type: 'START_MEETING' }
  | { type: 'END_MEETING' }
  | { type: 'MAKE_MOTION'; motionType: string; text: string; mover: string; agendaAmendment?: AgendaAmendment }
  | { type: 'SECOND_MOTION'; seconder: string }
  | { type: 'DECLINE_SECOND' }
  | { type: 'OPEN_VOTING' }
  | { type: 'CAST_VOTE'; vote: 'yea' | 'nay' | 'abstain'; voterId: number }
  | { type: 'CLOSE_VOTING' }
  | { type: 'RAISE_HAND'; member: Member }
  | { type: 'LOWER_HAND'; member: Member }
  | { type: 'RECOGNIZE_SPEAKER'; member: Member }
  | { type: 'YIELD_FLOOR' }
  | { type: 'ADD_AGENDA_ITEM'; title: string }
  | { type: 'REMOVE_AGENDA_ITEM'; id: number }
  | { type: 'ADOPT_AGENDA' }
  | { type: 'AGENDA_OBJECTION' }
  | { type: 'CALL_AGENDA_ITEM'; id: number }
  | { type: 'COMPLETE_AGENDA_ITEM'; id: number }
  | { type: 'REORDER_AGENDA'; fromIndex: number; toIndex: number }
  | { type: 'SET_SPEAKER_TIME_LIMIT'; seconds: number }
  | { type: 'SET_VOTE_TIME_LIMIT'; seconds: number }
  | { type: 'REQUEST_UNANIMOUS_CONSENT' }
  | { type: 'OBJECT_TO_CONSENT'; objector: string }
  | { type: 'UNANIMOUS_CONSENT_PASSED' }
  | { type: 'SET_VOTING_METHOD'; method: VotingMethod };

// Motion definition type
export interface MotionDefinition {
  name: string;
  precedence: number;
  category: 'privileged' | 'incidental' | 'subsidiary' | 'main';
  interrupt: boolean;
  needsSecond: boolean;
  debatable: boolean;
  amendable: boolean;
  reconsidered: boolean;
  vote: 'majority' | '2/3' | 'none';
  phrase: string;
  help: string;
  whenToUse: string;
}

export interface CategoryInfo {
  color: 'purple' | 'amber' | 'blue' | 'emerald';
  label: string;
}

// Component prop types
export interface ParticipantViewProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  currentUser: Member;
}

export interface ChairViewProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}

export interface AdminViewProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}

export interface MotionCardProps {
  motion: Motion;
  showHelp?: boolean;
}

export interface HelpTooltipProps {
  motion: MotionDefinition | Motion;
}

export interface CountdownTimerProps {
  endTime: number | null;
  label: string;
}

export interface DraggableAgendaListProps {
  agenda: AgendaItem[];
  dispatch: React.Dispatch<MeetingAction>;
  disabled: boolean;
  showStatus?: boolean;
}

export interface AgendaAmendmentFormProps {
  agenda: AgendaItem[];
  onSubmit: (text: string, agendaAmendment: AgendaAmendment) => void;
  onCancel: () => void;
}
