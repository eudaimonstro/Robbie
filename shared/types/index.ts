// Member and Meeting types
export interface Member {
  id: number;
  name: string;
  role: 'member' | 'chair' | 'admin';
  present: boolean;
}

export type DebateStance = 'pro' | 'con' | 'neutral';

export interface SpeakerQueueEntry {
  member: Member;
  stance: DebateStance;
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
  moverId?: number;
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
  ruleSuspension?: Partial<RuleSuspension> | null;
  moverHasSpoken?: boolean;
  tabledMotionId?: number;
  reconsideredMotionId?: number;
}

export interface AgendaAmendment {
  action: 'add' | 'remove' | 'reorder';
  title?: string;
  position?: 'beginning' | 'end' | number;
  itemId?: number;
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
  readonly time: string;
  readonly message: string;
}

export interface Votes {
  yea: number;
  nay: number;
  abstain: number;
}

export type VotingMethod = 'standard' | 'ballot' | 'rollcall';

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

export type SuspendableRule =
  | 'pro-con-alternation'
  | 'second-requirement'
  | 'motion-precedence'
  | 'amendment-depth'
  | 'motion-renewal'
  | 'chair-voting-restriction'
  | 'motion-maker-priority'
  | 'mover-cannot-second'
  | 'debate-rules'
  | 'order-of-business';

export interface RuleSuspension {
  id: number;
  rule: SuspendableRule;
  purpose: string;
  specificAction: string;
  scope: 'single-action' | 'meeting-remainder';
  suspendedAt: string;
  actionCompleted?: boolean;
  motionId: number;
}

export interface CompletedMotion {
  readonly id: number;
  readonly type: string;
  readonly name: string;
  readonly text: string;
  readonly passed: boolean;
  readonly voterChoices: Record<number, 'yea' | 'nay' | 'abstain'>;
  readonly timestamp: string;
  readonly reconsidered: boolean;
}

export interface Nomination {
  id: number;
  position: string;
  nomineeName: string;
  nomineeId?: number;
  nominatedBy: string;
  nominatorId: number;
  timestamp: string;
  declined: boolean;
}

export interface Election {
  id: number;
  position: string;
  candidates: Array<{ name: string; id?: number }>;
  requiredVotes: 'majority' | 'plurality' | '2/3';
  votingInProgress: boolean;
  ballotResults: Record<string, number>;
  votersWhoVoted: number[];
  elected: string | null;
}

export interface Officer {
  readonly position: string;
  readonly name: string;
  readonly memberId?: number;
  readonly electedAt: string;
}

export type InquiryType = 'parliamentary' | 'information';

export interface Inquiry {
  id: number;
  type: InquiryType;
  question: string;
  askedBy: string;
  askerId: number;
  timestamp: string;
  answer?: string;
  answeredBy?: string;
  answeredAt?: string;
}

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
  voterChoices: Record<number, 'yea' | 'nay' | 'abstain'>;
  votingOpen: boolean;
  votingMethod: VotingMethod;
  unanimousConsentPending: boolean;
  speakerQueue: SpeakerQueueEntry[];
  recognizedSpeaker: Member | null;
  lastSpeakerStance: DebateStance | null;
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
  completedMotions: CompletedMotion[];
  committeeReports: CommitteeReport[];
  minutesFromPreviousMeeting: string;
  minutesApproved: boolean;
  suspendedRules: RuleSuspension[];
  lastChairRuling: { ruling: string; motionText: string; timestamp: string } | null;
  nominations: Nomination[];
  nominationsOpen: boolean;
  currentNominationPosition: string | null;
  currentElection: Election | null;
  electedOfficers: Officer[];
  inquiries: Inquiry[];
}

// Action types
export type MeetingAction =
  | { type: 'START_MEETING'; meetingCode: string; timestamp: string }
  | { type: 'END_MEETING'; timestamp: string }
  | { type: 'MAKE_MOTION'; motionType: string; text: string; mover: string; moverId: number; motionId: number; timestamp: string; agendaAmendment?: AgendaAmendment; ruleSuspension?: Partial<RuleSuspension>; tabledMotionId?: number; reconsideredMotionId?: number }
  | { type: 'SECOND_MOTION'; seconder: string; timestamp: string }
  | { type: 'DECLINE_SECOND'; timestamp: string }
  | { type: 'OPEN_VOTING'; voteTimerEnd: number | null; timestamp: string }
  | { type: 'CAST_VOTE'; vote: 'yea' | 'nay' | 'abstain'; voterId: number; isChairDecidingVote?: boolean }
  | { type: 'CLOSE_VOTING'; timestamp: string }
  | { type: 'RAISE_HAND'; member: Member; stance: DebateStance }
  | { type: 'LOWER_HAND'; member: Member }
  | { type: 'RECOGNIZE_SPEAKER'; member: Member; stance: DebateStance; speakerTimerEnd: number | null; timestamp: string }
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
  | { type: 'PRESENT_COMMITTEE_REPORT'; reportId: number; timestamp: string }
  | { type: 'SUSPEND_RULE_APPROVED'; suspension: RuleSuspension; timestamp: string }
  | { type: 'RESTORE_RULE'; suspensionId: number; timestamp: string }
  | { type: 'CHAIR_RULING'; ruling: 'sustain' | 'overrule' | 'allow' | 'deny'; explanation?: string; timestamp: string }
  | { type: 'OPEN_NOMINATIONS'; position: string; timestamp: string }
  | { type: 'NOMINATE'; position: string; nomineeName: string; nomineeId?: number; nominatedBy: string; nominatorId: number; nominationId: number; timestamp: string }
  | { type: 'DECLINE_NOMINATION'; nominationId: number; timestamp: string }
  | { type: 'CLOSE_NOMINATIONS'; timestamp: string }
  | { type: 'START_ELECTION'; electionId: number; position: string; requiredVotes: 'majority' | 'plurality' | '2/3'; timestamp: string }
  | { type: 'CAST_BALLOT'; candidateName: string; voterId: number }
  | { type: 'CLOSE_ELECTION'; timestamp: string }
  | { type: 'DECLARE_ELECTED'; candidateName: string; timestamp: string }
  | { type: 'ASK_INQUIRY'; inquiryType: InquiryType; question: string; askedBy: string; askerId: number; inquiryId: number; timestamp: string }
  | { type: 'ANSWER_INQUIRY'; inquiryId: number; answer: string; answeredBy: string; timestamp: string };

// Motion definition type
export interface MotionDefinition {
  readonly name: string;
  readonly precedence: number;
  readonly category: 'privileged' | 'incidental' | 'subsidiary' | 'main';
  readonly interrupt: boolean;
  readonly needsSecond: boolean;
  readonly debatable: boolean;
  readonly amendable: boolean;
  readonly reconsidered: boolean;
  readonly vote: 'majority' | '2/3' | 'none';
  readonly phrase: string;
  readonly help: string;
  readonly whenToUse: string;
}

export interface CategoryInfo {
  readonly color: 'purple' | 'amber' | 'blue' | 'emerald';
  readonly label: string;
}

// Vote calculation types
export type VoteRequirement = 'majority' | '2/3' | 'none';

export interface VoteCalculationResult {
  passed: boolean;
  yea: number;
  nay: number;
  abstain: number;
  total: number;
  threshold: number;
  requirement: VoteRequirement;
}
