// Member and Meeting types

/**
 * A person's role in a live meeting, derived from the organization at every join: the
 * presiding officer is the chair, secretaries and above are admins, members are members, and
 * everyone else (viewers, people outside the organization) is a guest. In a board meeting the
 * directors are the members, and the organization's other members and viewers are observers:
 * they follow the meeting as a member does but take no part in it (no motion, second, vote or
 * request for the floor).
 */
export type MeetingRole = 'chair' | 'admin' | 'member' | 'guest' | 'observer';

/**
 * Who votes in a meeting: the members (an annual or special meeting of the members), or the
 * board, whose directors vote
 */
export type MeetingKind = 'members' | 'board';

/** A board meeting's board: how many directors it has, the quorum's denominator */
export interface BoardInfo {
  directors: number;
  /**
   * The board's quorum as the organization gives it (its setting, or a majority of the
   * directors) when it was last taken: a meeting whose quorum still is this follows a change
   */
  quorum?: number;
}

export interface Member {
  id: number;
  name: string;
  role: MeetingRole;
  /**
   * In a board meeting, a presiding officer (the chair, or an admin) who isn't a director: they
   * keep the console but don't vote, move or second, and never count toward the quorum
   */
  nonVoting?: boolean;
  present: boolean;
  /**
   * Why a present member is present: their device is connected, or the chair or secretary
   * marked them present. Only device presence ends when the device disconnects. Absent on a
   * member who isn't present (and on states saved before it existed, where it means device).
   */
  presentBy?: 'device' | 'chair';
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
  /** The scheduled agenda item (MeetingAgendaItem) this came from, for its attachments */
  packetItemId?: string;
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
  /**
   * Made by someone in the room and recorded by the chair (MAKE_FLOOR_MOTION): mover is the
   * member named, with their id, or a typed name with moverId 0
   */
  fromFloor?: boolean;
  /** Put to the meeting by the chair from the agenda: mover is PUT_BY_CHAIR and moverId 0 */
  putByChair?: boolean;
  /** An amendment's change to the words of the motion beneath it (amend, amendAmendment) */
  textAmendment?: TextAmendment;
  /** When a motion to postpone puts the question off to */
  postponeTo?: Postponement;
  /** Who a motion to refer sends the question to: "the board", "the landscaping committee" */
  referTo?: string;
  /** When a recess ends, as the mover gave it ("8:15 PM"), if they gave one */
  recessUntil?: string;
  /** The words as first moved, once an amendment has changed them */
  originalText?: string;
  /** Debate on this question was closed (close debate adopted): it is put to the vote */
  debateClosed?: boolean;
  /** For an appeal: the ruling appealed from, with what it removed */
  appealOf?: ChairRulingNote;
}

/** A ruling of the chair, as an appeal from it needs it */
export interface ChairRulingNote {
  ruling: string;
  motionText: string;
  timestamp: string;
  /** What a ruling of out of order removed, to put back if an appeal reverses it */
  removed?: { motion: Motion; awaitingSecond: boolean };
}

/**
 * An amendment's change to the words of the motion it amends (RONR 12): insert words (after
 * the words given, or at the end), strike words, strike words and insert others in their place,
 * or replace the whole text. The words struck, or inserted after, appear exactly once.
 */
export type TextAmendment =
  | { form: 'insert'; insert: string; after?: string }
  | { form: 'strike'; strike: string }
  | { form: 'strikeInsert'; strike: string; insert: string }
  | { form: 'substitute'; insert: string };

/** When a question is postponed to: the next meeting, or later in this one ("8:30 PM") */
export type Postponement = { kind: 'next-meeting' } | { kind: 'later'; when: string };

/** The details some motions need, with the motion that names them */
export interface MotionDetails {
  agendaAmendment?: AgendaAmendment;
  ruleSuspension?: Partial<RuleSuspension>;
  bylawAmendment?: BylawAmendment;
  tabledMotionId?: number;
  reconsideredMotionId?: number;
  dividedParts?: string[];
  textAmendment?: TextAmendment;
  postponeTo?: Postponement;
  referTo?: string;
  recessUntil?: string;
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

/**
 * The change a bylaw amendment motion proposes, carried in the motion so that everyone sees the
 * text they are voting on, and the text adopted is the text applied. The mover sends the
 * document, the change and its new text, or a proposed amendment to move; the server checks them
 * against the document's current version and fills in the rest (the fields marked so), so what
 * the room sees comes from the bylaws, never from the mover's device.
 */
export interface BylawAmendment {
  documentId: string; // Bylawyer document ID
  /** The document's title (set by the server) */
  documentTitle?: string;
  /**
   * The proposed amendment (status proposed) this motion moves, when moved from the drafts: its
   * change is copied into the motion by the server, and the sync marks it decided
   */
  amendmentId?: string;
  /** The proposed amendment's title (set by the server) */
  amendmentTitle?: string;
  changeType: BylawChangeType;
  /** The section changed, deleted or renumbered */
  targetSectionId?: string;
  /** That section's number and title, as 'Section 4.2 "Quorum"' (set by the server) */
  targetSectionLabel?: string;
  /** That section's title and text as they stand (set by the server) */
  currentTitle?: string;
  currentContent?: string;
  newContent?: string; // New/modified content
  newNumberLabel?: string; // New section number (for renumber, or an added section)
  newTitle?: string; // New section title
  /** Where an added section goes: under this section, or at the top level when absent */
  parentSectionId?: string;
  /** That section's number and title (set by the server) */
  parentSectionLabel?: string;
  /**
   * The vote it needs, from the organization's setting when it was moved (set by the server);
   * absent on motions made before the setting existed, which need two thirds of the votes cast
   */
  voteRequired?: VoteThreshold;
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

/**
 * How a vote is taken. Every method has a floor tally the chair enters for the people in the
 * room not voting on a device; a voice vote has only that.
 */
export type VotingMethod = 'standard' | 'voice' | 'ballot' | 'rollcall';

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
  /** Each device vote by member; empty for a secret ballot */
  readonly voterChoices: Record<number, 'yea' | 'nay' | 'abstain'>;
  readonly timestamp: string;
  /** Whether a motion to reconsider has brought this vote back */
  readonly reconsidered: boolean;
  /** A bylaw amendment's change: the text decided, for the sync, the minutes and reconsideration */
  readonly bylawAmendment?: BylawAmendment;
  readonly mover?: string; // Restored with the motion if it is reconsidered
  readonly moverId?: number;
  // The two parts of the vote, and how it was taken. Records made before these existed, which
  // were only of motions that can be reconsidered, have none of them.
  readonly deviceVotes?: Votes;
  readonly floorVotes?: Votes;
  readonly method?: VotingMethod;
  /** Whether the motion can be reconsidered (its definition's reconsidered flag) */
  readonly reconsiderable?: boolean;
  // What the minutes need. Records made before these existed have none of them.
  /** Who seconded it */
  readonly seconder?: string;
  /** How it was disposed of; a record without one was decided on a vote */
  readonly disposition?: Disposition;
  /** When, by the server's clock (ISO) */
  readonly decidedAt?: string;
  /** The agenda item under way when it was disposed of */
  readonly agendaItemId?: number;
  /** Whether a quorum was present when it was decided, on a vote or by unanimous consent */
  readonly quorumPresent?: boolean;
  /** The words as first moved, when amendments changed them (text is as decided) */
  readonly originalText?: string;
  /** Postponed: to when */
  readonly postponedTo?: Postponement;
  /** Referred: to whom */
  readonly referredTo?: string;
  /** Amendments pending on it when it left the floor (postponed or referred), by their words */
  readonly pendingAmendments?: string[];
  /** The vote was retaken as a counted vote after a member called for a division */
  readonly division?: true;
  /** Withdrawn once stated, with the meeting's permission (by unanimous consent or a vote) */
  readonly withPermission?: true;
  /** A voice vote the chair declared without a count: the ayes, or the noes, have it */
  readonly declared?: 'ayes' | 'noes';
}

/**
 * How a motion was disposed of: carried or failed on a vote, adopted by unanimous consent,
 * withdrawn by its mover, dead for want of a second, postponed (to a later time, or
 * indefinitely), referred, or ruled out of order by the chair
 */
export type Disposition =
  | 'carried'
  | 'failed'
  | 'unanimous'
  | 'withdrawn'
  | 'no-second'
  | 'postponed'
  | 'postponed-indefinitely'
  | 'referred'
  | 'out-of-order';

/** A ruling of the chair on a point that takes no vote, as the minutes record it */
export interface ChairRulingRecord {
  /** "The point is well taken." */
  readonly ruling: string;
  readonly explanation?: string;
  /** The point ruled on */
  readonly motionText: string;
  /** Who raised the point */
  readonly raisedBy?: string;
  /** The motion the chair ruled out of order with it, by its words */
  readonly outOfOrder?: string;
  readonly timestamp: string;
  readonly decidedAt?: string;
  readonly agendaItemId?: number;
}

/** How the meeting approved the previous meeting's minutes */
export interface MinutesApprovalRecord {
  /** The corrections made, or null when approved as read */
  readonly corrections: string | null;
  readonly timestamp: string;
  readonly decidedAt?: string;
  readonly agendaItemId?: number;
}

/**
 * A closed ballot's totals, beside its counts by name: the ballots cast (on devices, and paper
 * ballots not counting blanks: RONR 45:31 counts illegal ballots, not blank ones), the blank and
 * illegal paper ballots, and the names written in on paper
 */
export interface BallotTotals {
  readonly cast: number;
  readonly blank?: number;
  readonly illegal?: number;
  readonly writeIns?: readonly string[];
}

/** An election the chair set aside (SET_ASIDE_ELECTION), as the minutes record it */
export interface ElectionSetAsideRecord {
  /** The office, or null when none was named */
  readonly position: string | null;
  /** Each ballot closed before it was set aside, devices and paper together; counts only */
  readonly ballots?: ReadonlyArray<Record<string, number>>;
  /** Each of those ballots' totals, in the same order (records made before them have none) */
  readonly ballotTotals?: readonly BallotTotals[];
  /** The seats still open, when more than one */
  readonly seats?: number;
  readonly timestamp: string;
  readonly decidedAt?: string;
  readonly agendaItemId?: number;
}

/**
 * Business the meeting adjourned with unfinished (END_MEETING), as the minutes record it: a
 * motion pending or awaiting a second, or an election under way, with the agenda item it was
 * under
 */
export type UnfinishedBusinessRecord =
  | {
      readonly kind: 'motion';
      readonly id: number;
      readonly name: string;
      readonly text: string;
      readonly mover: string;
      readonly seconder?: string;
      /** Made, but not yet seconded */
      readonly awaitingSecond?: true;
      /** Postponed to later in the meeting and not taken up again */
      readonly postponed?: true;
      readonly agendaItemId?: number;
    }
  | {
      readonly kind: 'election';
      readonly position: string;
      /** Each ballot closed before the adjournment; counts only */
      readonly ballots?: ReadonlyArray<Record<string, number>>;
      readonly ballotTotals?: readonly BallotTotals[];
      /** The seats still open, when more than one or when some of the election's were filled */
      readonly seats?: number;
      readonly agendaItemId?: number;
    };

export interface Nomination {
  id: number;
  position: string;
  nomineeName: string;
  nomineeId: number;
  nominatedBy: string;
  /** Who entered it: the nominator, or for a nomination from the floor the chair */
  nominatorId: number;
  timestamp: string;
  declined: boolean;
  /** Made by someone in the room and recorded by the chair: nominatedBy is FROM_THE_FLOOR */
  fromFloor?: boolean;
}

export interface Election {
  id: number;
  position: string;
  /** Who is on the ballot; a name written in on paper joins from the next ballot, as a write-in */
  candidates: Array<{ name: string; id: number; writeIn?: boolean }>;
  requiredVotes: 'majority' | 'plurality' | '2/3';
  votingInProgress: boolean;
  /**
   * The seats this election still fills (one when absent): a ballot marks up to this many names,
   * and each declaration fills one
   */
  seats?: number;
  /**
   * Ballots cast on devices, by candidate name; once the ballot closes, the device and floor
   * ballots together
   */
  ballotResults: Record<string, number>;
  votersWhoVoted: number[];
  /** The tellers' count of paper ballots, by candidate name, entered by the chair */
  floorBallots?: Record<string, number>;
  /** Paper votes for names written in, by name */
  floorWriteIns?: Record<string, number>;
  /** Blank paper ballots (not counted as cast) and illegal ones (counted, for nobody) */
  floorBlank?: number;
  floorIllegal?: number;
  /** How many paper ballots were counted, blanks left out; entered when there are several seats */
  floorBallotCount?: number;
  /** Each closed ballot's count, devices and paper together, the first ballot first */
  ballots?: Array<Record<string, number>>;
  /** Each closed ballot's totals, in the same order */
  ballotTotals?: BallotTotals[];
  /**
   * Who has the vote required on the closed ballot, the most votes first, awaiting the chair's
   * declaration (one per open seat at most)
   */
  winners?: string[];
  /** The first of the winners (kept for states saved before winners existed) */
  elected: string | null;
  isRunoff?: boolean;
  runoffRound?: number;
}

export interface Officer {
  readonly position: string;
  readonly name: string;
  readonly memberId: number;
  readonly electedAt: string;
  /** Each ballot's count in the election that chose them */
  readonly ballots?: ReadonlyArray<Record<string, number>>;
  /** The vote the election required; records made before it was kept have none */
  readonly requiredVotes?: Election['requiredVotes'];
  /** Each ballot's totals, beside ballots */
  readonly ballotTotals?: readonly BallotTotals[];
  /** The election it came from: officers elected together share it */
  readonly electionId?: number;
  /** Declared elected without a ballot, as the only nominee or no more nominees than seats */
  readonly acclamation?: true;
  /** Written in on paper ballots, not nominated */
  readonly writeIn?: true;
  readonly agendaItemId?: number;
  readonly decidedAt?: string;
}

/** A question to the chair: about the rules, for information, or a question of privilege */
export type InquiryType = 'parliamentary' | 'information' | 'privilege';

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

/** A voice vote declared by the chair, open to a division (MeetingState.voiceVote) */
export interface VoiceVoteResult {
  motionId: number;
  passed: boolean;
  undo?: Partial<MeetingState>;
}

/** A recess, as the minutes record it */
export interface RecessRecord {
  /** When it began and ended, by the server's clock (ISO) */
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly agendaItemId?: number;
}

/** A question postponed to later in this meeting: its main motion and what adhered to it */
export interface PostponedQuestion {
  readonly motions: Motion[];
  /** "8:30 PM", "after the treasurer's report" */
  readonly when: string;
}

/** How the agenda was adopted, as the minutes record it */
export interface AgendaAdoptionRecord {
  readonly how: 'consent' | 'motion';
  readonly decidedAt?: string;
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
  /** The meeting's organization, title and date, from its packet */
  organizationId: string | null;
  title: string;
  scheduledFor: string | null;
  /** Who votes: the members (also when absent, in a state saved before it existed) or the board */
  kind?: MeetingKind;
  /**
   * A board meeting's board (null or absent for a meeting of the members): its directors' count,
   * kept up to date until the call to order, then the record of it
   */
  board?: BoardInfo | null;
  members: Member[];
  quorum: number;
  /** People in the room without an account, counted by the chair, and the names given */
  headcount: number;
  headcountNames: string[];
  /** Paper proxies and absentee ballots the chair holds: they count toward quorum */
  proxiesHeld: number;
  /**
   * People added by email who haven't signed in, counted in the room (in the headcount, and by
   * name in its names when they have one), by the id of their pending addition
   */
  headcountInvites: string[];
  motionStack: Motion[];
  currentMotion: Motion | null;
  pendingSecond: Motion | null;
  /** Device votes on the open question */
  votes: Votes;
  voters: number[];
  voterChoices: Record<number, 'yea' | 'nay' | 'abstain'>;
  /** The chair's count of the room for the open question, apart from the device votes */
  floorVotes: Votes;
  votingOpen: boolean;
  votingMethod: VotingMethod;
  unanimousConsentPending: boolean;
  /** The question the chair asked unanimous consent on; the request ends when it changes */
  consentMotionId?: number | null;
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
  /** The previous meeting's published minutes (Markdown), put before this meeting */
  minutesFromPreviousMeeting: string;
  minutesApproved: boolean;
  /** Which minutes those are (a Minutes id), or null when none were loaded */
  previousMinutesId: string | null;
  /** How the meeting approved them, or null until it has */
  minutesApproval: MinutesApprovalRecord | null;
  /** Whether a quorum was present when the meeting was called to order; null before */
  quorumAtCallToOrder: boolean | null;
  /** The chair's rulings, in order */
  chairRulings: ChairRulingRecord[];
  /** Members who have been present at any point, for the minutes' attendance */
  attendedIds: number[];
  /** Elections the chair set aside, in order */
  electionsSetAside: ElectionSetAsideRecord[];
  /** Business left unfinished when the meeting last adjourned */
  unfinishedAtAdjournment: UnfinishedBusinessRecord[];
  suspendedRules: RuleSuspension[];
  /** The latest ruling, while an appeal from it is in order (at once, before anything else) */
  lastChairRuling: ChairRulingNote | null;
  /** The meeting is in recess: since when (the chair's clock), and until when if set */
  recess?: { since: string; until: string | null } | null;
  /** The recesses taken, for the minutes */
  recesses?: RecessRecord[];
  /** A motion to adjourn carried: the chair declares the meeting adjourned next */
  adjournmentCarried?: boolean;
  /** Questions postponed to later in this meeting, for the chair to take up */
  postponedMotions?: PostponedQuestion[];
  /** How the agenda was adopted, once it is */
  agendaAdoption?: AgendaAdoptionRecord | null;
  /** A member called for a division on the open vote: it is counted, not by voice */
  divisionCalled?: boolean;
  /**
   * A voice vote the chair just declared without a count, while a member may still call for a
   * division (until other business comes up). `undo` is what deciding it changed, kept on the
   * server to put back if a division is called; clients don't receive it.
   */
  voiceVote?: VoiceVoteResult | null;
  /** The seats to fill for the position nominations are (or were) open for; one when absent */
  openSeats?: number | null;
  /**
   * The election those seats belong to, when some were filled (by acclamation, or a ballot before
   * nominations were reopened): its id and closed ballots, so it stays one election
   */
  continuingElection?: {
    id: number;
    ballots?: Array<Record<string, number>>;
    ballotTotals?: BallotTotals[];
  } | null;
  nominations: Nomination[];
  nominationsOpen: boolean;
  currentNominationPosition: string | null;
  currentElection: Election | null;
  electedOfficers: Officer[];
  inquiries: Inquiry[];
  dividedQuestionParts: Array<{ id: number; text: string; originalMotionId: number }>; // Pending parts from a divided motion
  rollCall: RollCallState | null;
  autoYieldOnTimeExpired: boolean; // Auto-yield floor when speaker time expires
}

// Action types
export type MeetingAction =
  | { type: 'START_MEETING'; timestamp: string }
  | { type: 'END_MEETING'; timestamp: string }
  | ({
      type: 'MAKE_MOTION';
      motionType: string;
      text: string;
      mover: string;
      moverId: number;
      motionId: number;
      timestamp: string;
      /** The chair puts the question from the agenda: recorded with no mover (presiding only) */
      putByChair?: boolean;
    } & MotionDetails)
  // A motion made by someone in the room, recorded by the chair or an admin presiding. The
  // mover is the member moverMemberId names, or else moverName; never the chair. recordedBy is
  // set by the server from the signed-in user, and motionId generated by it.
  | ({
      type: 'MAKE_FLOOR_MOTION';
      motionType: string;
      text: string;
      moverName: string;
      moverMemberId?: number;
      motionId: number;
      recordedBy?: number;
      timestamp: string;
    } & MotionDetails)
  // seconderId is set by the server from the signed-in user
  | { type: 'SECOND_MOTION'; seconder: string; seconderId?: number; timestamp: string }
  // Someone in the room seconds the motion awaiting a second, recorded by the chair: the member
  // named, the name typed, or else A_MEMBER_IN_THE_ROOM. recordedBy is set by the server.
  | {
      type: 'SECOND_FROM_FLOOR';
      seconderName?: string;
      seconderMemberId?: number;
      recordedBy?: number;
      timestamp: string;
    }
  // `at` (ISO) is set by the server on the decisions the minutes record (CLOCKED_ACTIONS)
  | { type: 'DECLINE_SECOND'; at?: string; timestamp: string }
  | {
      type: 'OPEN_VOTING';
      voteTimerEnd: number | null;
      timestamp: string;
      withoutQuorum?: boolean;
      /** The chair confirmed opening the vote with no quorum present */
      confirmedWithoutQuorum?: boolean;
    }
  | {
      type: 'CAST_VOTE';
      vote: 'yea' | 'nay' | 'abstain';
      voterId: number;
      isChairDecidingVote?: boolean;
      timestamp?: string;
    }
  // declared: the chair announces a voice vote's result without a count ("The ayes have it")
  | { type: 'CLOSE_VOTING'; declared?: 'ayes' | 'noes'; at?: string; timestamp: string }
  // The chair's count of the room: replaces the floor tally (a correction is a new entry)
  | { type: 'SET_FLOOR_TALLY'; yea: number; nay: number; abstain: number; timestamp: string }
  | { type: 'RAISE_HAND'; member: Member; stance: DebateStance }
  | { type: 'LOWER_HAND'; member: Member }
  | {
      type: 'RECOGNIZE_SPEAKER';
      member: Member;
      stance: DebateStance;
      speakerTimerEnd: number | null;
      timestamp: string;
    }
  // yieldedBy is set by the server: the speaker, or the chair ending the speaker's turn
  | { type: 'YIELD_FLOOR'; yieldedBy?: number; timestamp: string }
  | { type: 'ADD_AGENDA_ITEM'; title: string; itemId: number }
  | { type: 'REMOVE_AGENDA_ITEM'; id: number }
  // Without a quorum, adopting needs the chair's confirmation (confirmedWithoutQuorum)
  | { type: 'ADOPT_AGENDA'; confirmedWithoutQuorum?: boolean; at?: string; timestamp: string }
  // objectorId is set by the server from the signed-in user
  | { type: 'AGENDA_OBJECTION'; objectorId?: number; timestamp: string }
  | { type: 'CALL_AGENDA_ITEM'; id: number; timestamp: string }
  | { type: 'COMPLETE_AGENDA_ITEM'; id: number; timestamp: string }
  | { type: 'REORDER_AGENDA'; fromIndex: number; toIndex: number }
  | { type: 'SET_SPEAKER_TIME_LIMIT'; seconds: number }
  | { type: 'SET_VOTE_TIME_LIMIT'; seconds: number }
  | { type: 'REQUEST_UNANIMOUS_CONSENT'; timestamp: string }
  // objector and objectorId are set by the server from the signed-in user; an objection from
  // the floor is recorded by the chair, with the objector's name if given (floorObjector)
  | {
      type: 'OBJECT_TO_CONSENT';
      objector: string;
      objectorId?: number;
      fromFloor?: boolean;
      floorObjector?: string;
      timestamp: string;
    }
  | {
      type: 'UNANIMOUS_CONSENT_PASSED';
      confirmedWithoutQuorum?: boolean;
      at?: string;
      timestamp: string;
    }
  | { type: 'SET_VOTING_METHOD'; method: VotingMethod }
  | { type: 'ADVANCE_MEETING_STAGE'; timestamp: string }
  | { type: 'SET_MEETING_STAGE'; stage: MeetingStage; timestamp: string }
  | { type: 'SET_QUORUM'; quorum: number; timestamp: string }
  // Approve the previous minutes as read, or with the corrections the chair enters
  | { type: 'APPROVE_MINUTES'; corrections?: string; at?: string; timestamp: string }
  // Server-only: the previous meeting's published minutes, and which they are
  | { type: 'SET_PREVIOUS_MINUTES'; minutes: string; minutesId?: string }
  | { type: 'ADD_COMMITTEE_REPORT'; report: CommitteeReport }
  | { type: 'PRESENT_COMMITTEE_REPORT'; reportId: number; timestamp: string }
  | { type: 'SUSPEND_RULE_APPROVED'; suspension: RuleSuspension; timestamp: string }
  | { type: 'RESTORE_RULE'; suspensionId: number; timestamp: string }
  | {
      type: 'CHAIR_RULING';
      ruling: 'sustain' | 'overrule' | 'allow' | 'deny';
      /** Sustaining a point of order, the chair rules the motion it was about out of order */
      outOfOrder?: boolean;
      explanation?: string;
      at?: string;
      timestamp: string;
    }
  // seats: how many to elect (one when absent)
  | { type: 'OPEN_NOMINATIONS'; position: string; seats?: number; timestamp: string }
  | {
      type: 'NOMINATE';
      position: string;
      nomineeName: string;
      nomineeId: number;
      nominatedBy: string;
      nominatorId: number;
      nominationId: number;
      /** Made by someone in the room and recorded by the chair (presiding only) */
      fromFloor?: boolean;
      timestamp: string;
    }
  // declinedBy is set by the server from the signed-in user
  | { type: 'DECLINE_NOMINATION'; nominationId: number; declinedBy?: number; timestamp: string }
  | { type: 'CLOSE_NOMINATIONS'; timestamp: string }
  | {
      type: 'START_ELECTION';
      electionId: number;
      position: string;
      requiredVotes: 'majority' | 'plurality' | '2/3';
      confirmedWithoutQuorum?: boolean;
      timestamp: string;
    }
  // One ballot on a device: candidateNames marks up to the seats (candidateName, one name)
  | { type: 'CAST_BALLOT'; candidateName?: string; candidateNames?: string[]; voterId: number }
  | { type: 'CLOSE_ELECTION'; timestamp: string }
  // The tellers' count of paper ballots: marks by candidate name, names written in, blank and
  // illegal ballots, and with several seats the paper ballots counted. Replaces the last entry.
  | {
      type: 'SET_FLOOR_BALLOTS';
      counts: Record<string, number>;
      writeIns?: Record<string, number>;
      blank?: number;
      illegal?: number;
      ballots?: number;
      timestamp: string;
    }
  | { type: 'DECLARE_ELECTED'; candidateName: string; at?: string; timestamp: string }
  // The chair declares the remaining nominees elected without a ballot, when they are no more
  // than the open seats (electionId is set by the server)
  | {
      type: 'ELECT_BY_ACCLAMATION';
      electionId: number;
      confirmedWithoutQuorum?: boolean;
      at?: string;
      timestamp: string;
    }
  // The chair sets aside an election that can't go on (no nominee, a mistyped position): its
  // nominations close and its ballot, with any result not yet declared, is dropped
  | { type: 'SET_ASIDE_ELECTION'; at?: string; timestamp: string }
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
  // Server-only: a member joins (see the join handler)
  | { type: 'ADD_MEMBER'; member: Member; timestamp: string }
  // Server-only: a device connects or disconnects. presentBy defaults to 'device'.
  | {
      type: 'SET_MEMBER_PRESENCE';
      memberId: number;
      present: boolean;
      presentBy?: 'device' | 'chair';
      timestamp: string;
    }
  // Server-only: names and roles as the organization has them now, refreshed at each join
  | {
      type: 'REFRESH_MEMBERS';
      members: Array<{ id: number; name: string; role: MeetingRole; nonVoting?: boolean }>;
      timestamp: string;
    }
  // The chair marks a person from the organization's roster present. The server fills in
  // member from the roster; a client's member is replaced.
  | { type: 'MARK_PRESENT'; userId: number; member?: Member; timestamp: string }
  // People in the room without an account: replaces the count and the names, and the proxies
  // and absentee ballots held and the people added by email counted (each left out, it stays as
  // it is). With `base`, the counts it was made from: refused (HEADCOUNT_CHANGED) when the
  // meeting's are no longer those, so two screens can't overwrite each other's change
  | {
      type: 'SET_HEADCOUNT';
      count: number;
      names: string[];
      proxiesHeld?: number;
      invites?: string[];
      base?: HeadcountBase;
      timestamp: string;
    }
  // Server-only: the agenda from the packet, before the meeting starts
  | { type: 'RELOAD_AGENDA'; agenda: AgendaItem[]; timestamp: string }
  // Server-only: the meeting's organization, title and date from its packet, for a live state
  // saved before it recorded them
  | {
      type: 'SET_MEETING_INFO';
      organizationId: string;
      title: string;
      scheduledFor: string | null;
      timestamp: string;
    }
  // Server-only: who votes, from the packet and the organization, until the call to order: the
  // kind of meeting, the board (null for a meeting of the members) and the quorum that follows
  | {
      type: 'SET_BOARD';
      kind: MeetingKind;
      board: BoardInfo | null;
      quorum: number;
      timestamp: string;
    }
  // The mover withdraws a motion awaiting a second, or asks to withdraw the pending one (the
  // request is put to the meeting as motionId). requesterId is set by the server; with fromFloor
  // the chair records the request of a mover in the room.
  | {
      type: 'WITHDRAW_MOTION';
      requesterId: number;
      fromFloor?: boolean;
      motionId?: number;
      at?: string;
      timestamp: string;
    }
  | { type: 'MODIFY_MOTION'; requesterId: number; newText: string; timestamp: string }
  // The chair takes up a question postponed to later in the meeting (its main motion's id)
  | { type: 'TAKE_UP_POSTPONED'; motionId: number; timestamp: string }
  // The chair ends a recess
  | { type: 'RESUME_MEETING'; at?: string; timestamp: string }
  // A member calls for a division on a voice vote: it is counted instead (RONR 29). With fromFloor
  // the chair records it for someone in the room. requesterId is set by the server.
  | { type: 'REQUEST_DIVISION'; requesterId?: number; fromFloor?: boolean; timestamp: string }
  | { type: 'START_ROLL_CALL'; timestamp: string }
  | { type: 'RESPOND_ROLL_CALL'; memberId: number; status: AttendanceStatus; timestamp: string }
  | { type: 'COMPLETE_ROLL_CALL'; timestamp: string }
  | { type: 'MARK_ABSENT'; memberId: number; excused: boolean; timestamp: string }
  | { type: 'SET_AUTO_YIELD'; enabled: boolean };

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

/**
 * The vote a question needs: a majority or two thirds, of the votes cast (abstentions don't
 * count) or of all the voting members (RONR 44:9), whose number `members` gives
 */
export interface VoteThreshold {
  fraction: 'majority' | '2/3';
  of: 'cast' | 'members';
  members?: number;
}

/** What an organization's bylaw amendments need (Organization.bylawAmendmentVote) */
export type BylawAmendmentVote =
  'twoThirdsCast' | 'majorityCast' | 'majorityMembers' | 'twoThirdsMembers';

export interface VoteCalculationResult {
  passed: boolean;
  yea: number;
  nay: number;
  abstain: number;
  total: number;
  threshold: number;
  requirement: VoteRequirement;
  /** The yes votes needed to carry, when it is of all the voting members */
  needed?: number;
}

// Meeting Minutes types

/** Something the minutes record */
export type MinutesEntry =
  | { kind: 'motion'; motion: CompletedMotion }
  | { kind: 'ruling'; ruling: ChairRulingRecord }
  // One election: officer is the first chosen, officers everyone it chose, in order
  | { kind: 'election'; officer: Officer; officers?: Officer[] }
  | { kind: 'setAside'; setAside: ElectionSetAsideRecord }
  | { kind: 'minutes'; approval: MinutesApprovalRecord }
  | { kind: 'recess'; recess: RecessRecord };

/** An agenda item, with what was decided under it in the order it happened */
export interface MinutesItem {
  title: string;
  status: AgendaItem['status'];
  entries: MinutesEntry[];
}

/** The meeting's counts a SET_HEADCOUNT was made from */
export interface HeadcountBase {
  count: number;
  names: string[];
  proxiesHeld: number;
  invites?: string[];
}

/** What the minutes of a meeting record, from its final state (see generateMeetingMinutes) */
export interface MeetingMinutes {
  meetingCode: string;
  title: string;
  chairName: string | null;
  /** Members (not guests) present at any point; marked when the chair marked them present */
  present: Array<{ id: number; name: string; marked: boolean }>;
  /** Guests present at any point, by name */
  guests: string[];
  /** A board meeting's board, whose directors voted (null or absent: the members voted) */
  board?: BoardInfo | null;
  /**
   * In a board meeting, the organization's people present who don't vote (observers, and a
   * presiding officer who isn't a director), by name
   */
  alsoPresent?: string[];
  /** People present without an account, and the names given for them */
  headcount: number;
  headcountNames: string[];
  /** Paper proxies and absentee ballots held, counted toward the quorum */
  proxiesHeld: number;
  quorum: number;
  quorumAtCallToOrder: boolean | null;
  /** The agenda in order */
  items: MinutesItem[];
  /** What was decided outside any agenda item, in order */
  otherEntries: MinutesEntry[];
  /** Questions postponed to the next meeting, for its agenda */
  postponedToNextMeeting: CompletedMotion[];
  /** How the agenda was adopted, and any motion on it, before the first item */
  agenda: { adoption: AgendaAdoptionRecord | null; motions: CompletedMotion[] };
  /** The business the meeting adjourned with unfinished, in order */
  unfinished: UnfinishedBusinessRecord[];
}

/** What the minutes need from outside the meeting state: its organization and its packet */
export interface MinutesContext {
  organizationName: string;
  /** An IANA time zone name: the minutes give dates and times there */
  timeZone: string;
  title: string;
  location: string | null;
  /** When the meeting was scheduled, called to order and adjourned (ISO) */
  scheduledFor: string | null;
  calledToOrderAt: string | null;
  adjournedAt: string | null;
  /**
   * The organization's voting members (member role and above), for the absent list; in a board
   * meeting, its directors
   */
  voters: Array<{ id: number; name: string }>;
}
