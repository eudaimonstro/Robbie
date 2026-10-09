import type { MeetingState } from '../types/index.js';

/**
 * Clean initial state for new meetings. The server creates each live meeting's state from
 * its packet (code, organization, title, date, quorum, agenda); the rest starts here.
 * - Members: added when people join, with the role their organization gives them
 * - Committee Reports: Chair adds as needed
 * - Previous Minutes: the organization's latest published minutes, loaded by the server
 */
export const initialState: MeetingState = {
  meetingStage: 'not-started' as const,
  meetingActive: false,
  meetingCode: '',
  organizationId: null,
  title: '',
  scheduledFor: null,
  kind: 'members',
  board: null,
  members: [], // Members are added dynamically when users join
  quorum: 3,
  headcount: 0,
  headcountNames: [],
  proxiesHeld: 0,
  headcountInvites: [],
  motionStack: [],
  currentMotion: null,
  pendingSecond: null,
  votes: { yea: 0, nay: 0, abstain: 0 },
  voters: [],
  voterChoices: {},
  floorVotes: { yea: 0, nay: 0, abstain: 0 },
  votingOpen: false,
  votingMethod: 'standard' as const,
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
  defeatedMotions: [],
  completedMotions: [],
  committeeReports: [], // Chair adds committee reports as needed
  // The previous meeting's published minutes, put before this one by the server
  minutesFromPreviousMeeting: '',
  minutesApproved: false,
  previousMinutesId: null,
  minutesApproval: null,
  quorumAtCallToOrder: null,
  chairRulings: [],
  attendedIds: [],
  electionsSetAside: [],
  unfinishedAtAdjournment: [],
  lastChairRuling: null,
  nominations: [],
  nominationsOpen: false,
  currentNominationPosition: null,
  currentElection: null,
  electedOfficers: [],
  inquiries: [],
  rollCall: null,
  autoYieldOnTimeExpired: false,
};
