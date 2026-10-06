// Member and Meeting types
export interface Member {
  id: number;
  name: string;
  role: 'member' | 'chair' | 'admin';
  present: boolean;
  selfRenameUsed?: boolean; // Members can only rename themselves once
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
  moverId: number;
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
  bylawAmendment?: BylawAmendment | null; // For bylawAmendment motion type
  moverHasSpoken?: boolean;
  tabledMotionId?: number;
  reconsideredMotionId?: number;
  dividedParts?: string[]; // For divideQuestion motion - the parts to split into
}

export interface AgendaAmendment {
  action: 'add' | 'remove' | 'reorder';
  title?: string;
  position?: 'beginning' | 'end' | number;
  itemId?: number;
  fromIndex?: number;
  toIndex?: number;
}

// Bylaw amendment types for Bylawyer integration
export type BylawChangeType = 'add' | 'modify' | 'delete' | 'renumber';

export interface BylawAmendment {
  documentId: string; // Bylawyer document ID
  documentTitle?: string; // Document title for display
  changeType: BylawChangeType;
  targetSectionId?: string; // Section being modified
  targetSectionLabel?: string; // Section label for display (e.g., "Article III, Section 2")
  newContent?: string; // New/modified content
  newNumberLabel?: string; // New section number (for renumber)
  newTitle?: string; // New section title
  parentSectionId?: string; // Parent section for add operations
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
  readonly bylawAmendment?: BylawAmendment; // Preserved for Bylawyer sync
  readonly mover?: string; // Restored with the motion if it is reconsidered
  readonly moverId?: number;
}

export interface Nomination {
  id: number;
  position: string;
  nomineeName: string;
  nomineeId: number;
  nominatedBy: string;
  nominatorId: number;
  timestamp: string;
  declined: boolean;
}

export interface Election {
  id: number;
  position: string;
  candidates: Array<{ name: string; id: number }>;
  requiredVotes: 'majority' | 'plurality' | '2/3';
  votingInProgress: boolean;
  ballotResults: Record<string, number>;
  votersWhoVoted: number[];
  elected: string | null;
  isRunoff?: boolean;
  runoffRound?: number;
}

export interface Officer {
  readonly position: string;
  readonly name: string;
  readonly memberId: number;
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

export type AttendanceStatus = 'present' | 'absent' | 'excused' | 'not-responded';

// Proxy voting types
export interface ProxyAuthorization {
  readonly id: number;
  readonly grantedBy: number; // Absent member's ID
  readonly grantedTo: number; // Proxy holder's ID
  readonly grantedByName: string; // For display
  readonly grantedToName: string; // For display
  readonly grantedAt: string; // Timestamp
  readonly scope: 'all' | 'single-vote'; // For all votes or just next one
}

export interface ProxyVoteRecord {
  readonly memberId: number; // The member whose vote this represents
  readonly castBy: number; // The proxy holder who cast it
  readonly vote: 'yea' | 'nay' | 'abstain';
}

// Member-initiated proxy request types
export type ProxyRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

export interface PendingProxyRequest {
  readonly id: number;
  readonly requestedBy: number; // Member requesting the proxy
  readonly requestedByName: string;
  readonly requestedFor: number; // Designated proxy holder
  readonly requestedForName: string;
  readonly requestedAt: string;
  readonly scope: 'all' | 'single-vote';
  readonly status: ProxyRequestStatus;
  readonly respondedAt?: string;
  readonly declineReason?: string;
}

export interface RollCallRecord {
  memberId: number;
  memberName: string;
  status: AttendanceStatus;
  respondedAt?: string;
}

export interface RollCallState {
  inProgress: boolean;
  startedAt?: string;
  completedAt?: string;
  responses: RollCallRecord[];
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
  debatePositions: Record<number, DebateStance>; // Tracks each member's locked debate stance on current motion
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
  defeatedMotions: Array<{
    type: string;
    text: string;
    timestamp: string;
    // The proposed change, for a defeated bylaw amendment (its text alone can't identify it)
    bylawAmendment?: BylawAmendment;
  }>;
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
  dividedQuestionParts: Array<{ id: number; text: string; originalMotionId: number }>; // Pending parts from a divided motion
  rollCall: RollCallState | null;
  autoYieldOnTimeExpired: boolean; // Auto-yield floor when speaker time expires
  // Proxy voting
  allowProxyVoting: boolean; // Whether proxy voting is enabled
  maxProxiesPerMember: number; // Max proxies one member can hold (0 = unlimited)
  proxiesCountForQuorum: boolean; // Whether proxy holders count absent members toward quorum
  proxies: ProxyAuthorization[]; // Active proxy authorizations
  proxyVotes: ProxyVoteRecord[]; // Proxy votes cast in current vote (reset when voting opens)
  // Member-controlled proxy authorization
  allowMemberProxyGrant: boolean; // Whether members can request proxies themselves
  pendingProxyRequests: PendingProxyRequest[]; // Requests awaiting acceptance
}

// Action types
export type MeetingAction =
  | { type: 'START_MEETING'; timestamp: string }
  | { type: 'END_MEETING'; timestamp: string }
  | {
      type: 'MAKE_MOTION';
      motionType: string;
      text: string;
      mover: string;
      moverId: number;
      motionId: number;
      timestamp: string;
      agendaAmendment?: AgendaAmendment;
      ruleSuspension?: Partial<RuleSuspension>;
      bylawAmendment?: BylawAmendment;
      tabledMotionId?: number;
      reconsideredMotionId?: number;
      dividedParts?: string[];
    }
  // seconderId is set by the server from the signed-in user
  | { type: 'SECOND_MOTION'; seconder: string; seconderId?: number; timestamp: string }
  | { type: 'DECLINE_SECOND'; timestamp: string }
  | { type: 'OPEN_VOTING'; voteTimerEnd: number | null; timestamp: string; withoutQuorum?: boolean }
  | {
      type: 'CAST_VOTE';
      vote: 'yea' | 'nay' | 'abstain';
      voterId: number;
      isChairDecidingVote?: boolean;
      timestamp?: string;
    }
  | { type: 'CLOSE_VOTING'; timestamp: string }
  | { type: 'RAISE_HAND'; member: Member; stance: DebateStance }
  | { type: 'LOWER_HAND'; member: Member }
  | {
      type: 'RECOGNIZE_SPEAKER';
      member: Member;
      stance: DebateStance;
      speakerTimerEnd: number | null;
      timestamp: string;
    }
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
  | { type: 'SET_MEETING_STAGE'; stage: MeetingStage; timestamp: string }
  | { type: 'SET_QUORUM'; quorum: number; timestamp: string }
  | { type: 'APPROVE_MINUTES'; timestamp: string }
  | { type: 'SET_PREVIOUS_MINUTES'; minutes: string }
  | { type: 'ADD_COMMITTEE_REPORT'; report: CommitteeReport }
  | { type: 'PRESENT_COMMITTEE_REPORT'; reportId: number; timestamp: string }
  | { type: 'SUSPEND_RULE_APPROVED'; suspension: RuleSuspension; timestamp: string }
  | { type: 'RESTORE_RULE'; suspensionId: number; timestamp: string }
  | {
      type: 'CHAIR_RULING';
      ruling: 'sustain' | 'overrule' | 'allow' | 'deny';
      explanation?: string;
      timestamp: string;
    }
  | { type: 'OPEN_NOMINATIONS'; position: string; timestamp: string }
  | {
      type: 'NOMINATE';
      position: string;
      nomineeName: string;
      nomineeId: number;
      nominatedBy: string;
      nominatorId: number;
      nominationId: number;
      timestamp: string;
    }
  | { type: 'DECLINE_NOMINATION'; nominationId: number; timestamp: string }
  | { type: 'CLOSE_NOMINATIONS'; timestamp: string }
  | {
      type: 'START_ELECTION';
      electionId: number;
      position: string;
      requiredVotes: 'majority' | 'plurality' | '2/3';
      timestamp: string;
    }
  | { type: 'CAST_BALLOT'; candidateName: string; voterId: number }
  | { type: 'CLOSE_ELECTION'; timestamp: string }
  | { type: 'DECLARE_ELECTED'; candidateName: string; timestamp: string }
  | {
      type: 'ASK_INQUIRY';
      inquiryType: InquiryType;
      question: string;
      askedBy: string;
      askerId: number;
      inquiryId: number;
      timestamp: string;
    }
  | {
      type: 'ANSWER_INQUIRY';
      inquiryId: number;
      answer: string;
      answeredBy: string;
      timestamp: string;
    }
  | {
      type: 'SET_MEMBER_ROLE';
      targetMemberId: number;
      newRole: 'member' | 'chair' | 'admin';
      previousChairId?: number;
      changedBy?: string;
      changedById?: number;
      timestamp: string;
    }
  | { type: 'ADD_MEMBER'; member: Member; timestamp: string }
  | { type: 'SET_MEMBER_PRESENCE'; memberId: number; present: boolean; timestamp: string }
  | { type: 'WITHDRAW_MOTION'; requesterId: number; timestamp: string }
  | { type: 'MODIFY_MOTION'; requesterId: number; newText: string; timestamp: string }
  | { type: 'START_ROLL_CALL'; timestamp: string }
  | { type: 'RESPOND_ROLL_CALL'; memberId: number; status: AttendanceStatus; timestamp: string }
  | { type: 'COMPLETE_ROLL_CALL'; timestamp: string }
  | { type: 'MARK_ABSENT'; memberId: number; excused: boolean; timestamp: string }
  | { type: 'SET_AUTO_YIELD'; enabled: boolean }
  // Proxy voting actions
  | {
      type: 'SET_PROXY_SETTINGS';
      allowProxyVoting: boolean;
      maxProxiesPerMember: number;
      proxiesCountForQuorum: boolean;
      allowMemberProxyGrant?: boolean;
      timestamp: string;
    }
  | {
      type: 'GRANT_PROXY';
      proxyId: number;
      grantedBy: number;
      grantedTo: number;
      grantedByName: string;
      grantedToName: string;
      scope: 'all' | 'single-vote';
      timestamp: string;
    }
  | { type: 'REVOKE_PROXY'; proxyId: number; timestamp: string }
  | {
      type: 'CAST_PROXY_VOTE';
      vote: 'yea' | 'nay' | 'abstain';
      forMemberId: number;
      castById: number;
      timestamp: string;
    }
  // Member-initiated proxy request actions
  | {
      type: 'REQUEST_PROXY';
      requestId: number;
      requestedBy: number;
      requestedByName: string;
      requestedFor: number;
      requestedForName: string;
      scope: 'all' | 'single-vote';
      timestamp: string;
    }
  | { type: 'ACCEPT_PROXY'; requestId: number; proxyId: number; timestamp: string }
  | { type: 'DECLINE_PROXY'; requestId: number; reason?: string; timestamp: string }
  | { type: 'CANCEL_PROXY_REQUEST'; requestId: number; timestamp: string }
  // Member management
  | {
      type: 'RENAME_MEMBER';
      memberId: number;
      newName: string;
      renamedBy: number;
      timestamp: string;
    };

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

export type CategoryColor = 'purple' | 'amber' | 'blue' | 'emerald';

export interface CategoryInfo {
  readonly color: CategoryColor;
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

// Meeting Minutes types
export interface AttendanceRecord {
  memberId: number;
  name: string;
  role: 'member' | 'chair' | 'admin';
  status: 'present' | 'absent' | 'excused' | 'late' | 'left-early';
  arrivedAt?: string;
  departedAt?: string;
}

export interface MinutesMotionRecord {
  id: number;
  type: string;
  name: string;
  text: string;
  mover: string;
  moverId: number;
  seconder?: string;
  outcome: 'passed' | 'failed' | 'withdrawn' | 'tabled';
  voteCount?: { yea: number; nay: number; abstain: number };
  voterChoices?: Record<number, 'yea' | 'nay' | 'abstain'>;
  timestamp: string;
}

export interface MinutesElectionRecord {
  position: string;
  candidates: string[];
  winner: string | null;
  ballotResults: Record<string, number>;
  wasRunoff: boolean;
  timestamp: string;
}

export interface MeetingMinutes {
  meetingCode: string;
  startTime: string;
  endTime?: string;
  chairName?: string;
  attendance: AttendanceRecord[];
  quorumPresent: boolean;
  agendaItems: Array<{ title: string; status: 'completed' | 'pending' | 'active' }>;
  motions: MinutesMotionRecord[];
  elections: MinutesElectionRecord[];
  electedOfficers: Officer[];
  announcements: string[];
  nextMeetingDate?: string;
  generatedAt: string;
}
