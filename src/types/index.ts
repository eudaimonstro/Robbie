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
  moverId?: number; // ID of member who made the motion
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
  moverHasSpoken?: boolean; // Track if motion maker has had floor for debate
}

export interface AgendaAmendment {
  action: 'add' | 'remove' | 'reorder';
  title?: string;
  position?: 'beginning' | 'end' | number;
  itemId?: number; // For remove action OR for the new item ID when adding
  fromIndex?: number;
  toIndex?: number;
}

export interface CommitteeReport {
  id: number;
  committee: string;
  presenter: string;
  summary: string;
  recommendations?: string;
  presented: boolean;
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

export type MeetingStage =
  | 'not-started'
  | 'call-to-order'
  | 'minutes-approval'
  | 'reports'
  | 'special-orders'
  | 'unfinished-business'
  | 'new-business'
  | 'announcements'
  | 'adjourned';

// State type
export interface MeetingState {
  meetingStage: MeetingStage;
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
  defeatedMotions: Array<{ type: string; text: string; timestamp: string }>;
  committeeReports: CommitteeReport[];
  minutesFromPreviousMeeting: string;
  minutesApproved: boolean;
}

// Action types
export type MeetingAction =
  | { type: 'START_MEETING'; meetingCode: string; timestamp: string }
  | { type: 'END_MEETING'; timestamp: string }
  | { type: 'MAKE_MOTION'; motionType: string; text: string; mover: string; moverId: number; motionId: number; timestamp: string; agendaAmendment?: AgendaAmendment }
  | { type: 'SECOND_MOTION'; seconder: string; timestamp: string }
  | { type: 'DECLINE_SECOND'; timestamp: string }
  | { type: 'OPEN_VOTING'; voteTimerEnd: number | null; timestamp: string }
  | { type: 'CAST_VOTE'; vote: 'yea' | 'nay' | 'abstain'; voterId: number; isChairDecidingVote?: boolean }
  | { type: 'CLOSE_VOTING'; timestamp: string }
  | { type: 'RAISE_HAND'; member: Member }
  | { type: 'LOWER_HAND'; member: Member }
  | { type: 'RECOGNIZE_SPEAKER'; member: Member; speakerTimerEnd: number | null; timestamp: string }
  | { type: 'YIELD_FLOOR'; timestamp: string }
  | { type: 'ADD_AGENDA_ITEM'; title: string; itemId: number }
  | { type: 'REMOVE_AGENDA_ITEM'; id: number }
  | { type: 'ADOPT_AGENDA'; timestamp: string }
  | { type: 'AGENDA_OBJECTION'; timestamp: string }
  | { type: 'CALL_AGENDA_ITEM'; id: number; timestamp: string }
  | { type: 'COMPLETE_AGENDA_ITEM'; id: number; timestamp: string }
  | { type: 'REORDER_AGENDA'; fromIndex: number; toIndex: number }
  | { type: 'SET_SPEAKER_TIME_LIMIT'; seconds: number }
  | { type: 'SET_VOTE_TIME_LIMIT'; seconds: number }
  | { type: 'REQUEST_UNANIMOUS_CONSENT'; timestamp: string }
  | { type: 'OBJECT_TO_CONSENT'; objector: string; timestamp: string }
  | { type: 'UNANIMOUS_CONSENT_PASSED'; timestamp: string }
  | { type: 'SET_VOTING_METHOD'; method: VotingMethod }
  | { type: 'ADVANCE_MEETING_STAGE'; timestamp: string }
  | { type: 'APPROVE_MINUTES'; timestamp: string }
  | { type: 'SET_PREVIOUS_MINUTES'; minutes: string }
  | { type: 'ADD_COMMITTEE_REPORT'; report: CommitteeReport }
  | { type: 'PRESENT_COMMITTEE_REPORT'; reportId: number; timestamp: string };

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
