import type { MeetingState } from '../types/index.js';

/**
 * Clean initial state for new meetings.
 * All data is populated dynamically:
 * - Members: Added when users join via socket (first user becomes chair)
 * - Agenda: Chair adds items before/during meeting
 * - Committee Reports: Chair adds as needed
 * - Previous Minutes: Can be set via admin interface
 */
export const initialState: MeetingState = {
  meetingStage: "not-started" as const,
  meetingActive: false,
  meetingCode: "",
  members: [], // Members are added dynamically when users join
  quorum: 3,
  motionStack: [],
  currentMotion: null,
  pendingSecond: null,
  votes: { yea: 0, nay: 0, abstain: 0 },
  voters: [],
  voterChoices: {},
  votingOpen: false,
  votingMethod: "standard" as const,
  unanimousConsentPending: false,
  speakerQueue: [],
  recognizedSpeaker: null,
  lastSpeakerStance: null,
  debatePositions: {},
  speakerTimerEnd: null,
  voteTimerEnd: null,
  speakerTimeLimit: 120,
  voteTimeLimit: 60,
  meetingLog: [],
  agenda: [], // Chair adds agenda items
  agendaAdopted: false,
  agendaObjection: false,
  currentAgendaItem: null,
  tabledMotions: [],
  defeatedMotions: [],
  completedMotions: [],
  committeeReports: [], // Chair adds committee reports as needed
  minutesFromPreviousMeeting: "", // Can be set via admin interface before meeting
  minutesApproved: false,
  suspendedRules: [],
  lastChairRuling: null,
  nominations: [],
  nominationsOpen: false,
  currentNominationPosition: null,
  currentElection: null,
  electedOfficers: [],
  inquiries: [],
  dividedQuestionParts: [],
  rollCall: null,
  autoYieldOnTimeExpired: false,
  // Proxy voting defaults (disabled by default per Robert's Rules)
  allowProxyVoting: false,
  maxProxiesPerMember: 2,  // Default limit of 2 proxies per member
  proxiesCountForQuorum: false,  // By default, proxies don't count for quorum
  proxies: [],
  proxyVotes: [],
  // Member-controlled proxy authorization (disabled by default)
  allowMemberProxyGrant: false,
  pendingProxyRequests: [],
};
