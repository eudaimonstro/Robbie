// Socket.io event types for client-server communication

import type { MeetingAction, MeetingRole, MeetingState, Member } from './index.js';

// Client → Server events
export interface ClientToServerEvents {
  JOIN_MEETING: (
    data: JoinMeetingPayload,
    callback: (response: JoinMeetingResponse) => void,
  ) => void;
  LEAVE_MEETING: () => void;
  DISPATCH_ACTION: (
    data: DispatchActionPayload,
    callback: (response: ActionResponse) => void,
  ) => void;
  REQUEST_STATE: (callback: (response: StateResponse) => void) => void;
}

// Server → Client events
export interface ServerToClientEvents {
  STATE_UPDATE: (data: StateUpdatePayload) => void;
  ACTION_REJECTED: (data: ActionRejectedPayload) => void;
  MEMBER_JOINED: (data: MemberEventPayload) => void;
  MEMBER_LEFT: (data: MemberEventPayload) => void;
  ERROR: (data: ErrorPayload) => void;
}

// Payloads for client → server events
export interface JoinMeetingPayload {
  meetingCode: string;
  /** A display (TV or projector): receives the state without becoming a member */
  display?: boolean;
}

export interface JoinMeetingResponse {
  success: boolean;
  state?: MeetingState;
  stateVersion?: number;
  members?: Member[];
  error?: string;
  errorCode?: ActionErrorCode;
}

export interface DispatchActionPayload {
  action: MeetingAction;
  clientSequence: number; // For optimistic updates tracking
}

export interface ActionResponse {
  success: boolean;
  stateVersion?: number;
  error?: string;
  errorCode?: ActionErrorCode;
}

export interface StateResponse {
  success: boolean;
  state?: MeetingState;
  stateVersion?: number;
  error?: string;
}

// Payloads for server → client events
export interface StateUpdatePayload {
  state: MeetingState;
  stateVersion: number;
  triggeredBy?: {
    actionType: string;
    userId: number;
  };
}

export interface ActionRejectedPayload {
  clientSequence: number;
  reason: string;
  errorCode: ActionErrorCode;
}

export interface MemberEventPayload {
  member: Member;
  timestamp: string;
}

export interface ErrorPayload {
  message: string;
  code: string;
}

// Error codes for action rejection
export type ActionErrorCode =
  | 'PERMISSION_DENIED'
  | 'INVALID_ACTION'
  | 'INVALID_STATE'
  | 'MEETING_NOT_FOUND'
  | 'NOT_AUTHENTICATED'
  | 'RATE_LIMITED'
  | 'CONCURRENCY_CONFLICT'
  | 'QUORUM_NOT_PRESENT'
  | 'NOT_A_MEMBER'
  | 'NOT_PRESENT'
  | 'VOTING_CLOSED'
  | 'VALIDATION_FAILED'
  // Meeting state errors
  | 'MEETING_ALREADY_ACTIVE'
  | 'MEETING_NOT_ACTIVE'
  // Motion errors
  | 'UNKNOWN_MOTION_TYPE'
  | 'MOTION_PRECEDENCE_VIOLATION'
  | 'NO_PENDING_SECOND'
  | 'NO_CURRENT_MOTION'
  | 'MOTION_NOT_DEBATABLE'
  | 'MOTION_RENEWAL_BLOCKED'
  | 'NOT_MOTION_MAKER'
  | 'DEBATE_BEGUN'
  // Voting errors
  | 'VOTING_ALREADY_OPEN'
  | 'VOTING_NOT_OPEN'
  | 'VOTING_IN_PROGRESS'
  | 'ALREADY_VOTED'
  | 'CHAIR_CANNOT_VOTE'
  | 'VOTING_METHOD'
  // Speaker errors
  | 'ALREADY_IN_QUEUE'
  | 'NOT_IN_QUEUE'
  | 'SPEAKER_HAS_FLOOR'
  | 'NO_SPEAKER'
  | 'MOVER_SPEAKS_FIRST'
  | 'CANNOT_SWITCH_SIDES'
  // Agenda errors
  | 'AGENDA_ALREADY_ADOPTED'
  | 'OBJECTION_ALREADY_REGISTERED'
  | 'AGENDA_NOT_ADOPTED'
  | 'ITEM_NOT_FOUND'
  | 'ITEM_ALREADY_COMPLETED'
  | 'NO_ACTIVE_ITEM'
  | 'WRONG_AGENDA_ITEM'
  // Unanimous consent errors
  | 'CONSENT_ALREADY_PENDING'
  | 'NO_CONSENT_PENDING'
  // Minutes errors
  | 'MINUTES_ALREADY_APPROVED'
  // Nomination errors
  | 'NOMINATIONS_ALREADY_OPEN'
  | 'NOMINATIONS_NOT_OPEN'
  | 'WRONG_POSITION'
  | 'ALREADY_NOMINATED'
  | 'NOMINATION_NOT_FOUND'
  | 'NOMINATION_ALREADY_DECLINED'
  // Election errors
  | 'ELECTION_IN_PROGRESS'
  | 'NO_ELECTION'
  | 'ELECTION_VOTING_NOT_OPEN'
  | 'ALREADY_VOTED_ELECTION'
  // Inquiry errors
  | 'INQUIRY_NOT_FOUND'
  | 'INQUIRY_ALREADY_ANSWERED'
  // Member errors
  | 'MEMBER_NOT_FOUND'
  | 'ROLE_UNCHANGED'
  | 'MEMBER_EXISTS'
  | 'MEMBER_CONNECTED'
  | 'NAME_REQUIRED'
  // Report errors
  | 'REPORT_NOT_FOUND'
  | 'REPORT_ALREADY_PRESENTED'
  // Rule suspension errors
  | 'SUSPENSION_NOT_FOUND'
  // Proxy voting errors
  | 'PROXY_VOTING_DISABLED'
  | 'NO_PROXY_AUTHORITY'
  | 'PROXY_NOT_FOUND'
  | 'MAX_PROXIES_REACHED'
  | 'PROXY_ALREADY_GRANTED'
  | 'CANNOT_PROXY_SELF'
  | 'RECEIVER_NOT_PRESENT'
  // Member proxy request errors
  | 'MEMBER_PROXY_DISABLED'
  | 'REQUEST_PENDING'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_NOT_PENDING'
  // Roll call errors
  | 'ROLL_CALL_NOT_IN_PROGRESS'
  // Member rename errors
  | 'RENAME_LIMIT_REACHED';

// Auth-related types
export interface AuthPayload {
  email: string;
  name: string;
  meetingCode: string;
}

export interface VerificationPayload {
  email: string;
  code: string;
  meetingCode: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: {
    id: number;
    email: string;
    name: string;
  };
  error?: string;
}

// Socket data attached to authenticated connections
export interface SocketData {
  userId: number;
  email: string;
  name: string;
  /** The session this socket signed in with */
  sessionId: string;
  meetingCode: string | null;
  role: MeetingRole;
  /** Joined as a display: in the room, not a member */
  display?: boolean;
}
