// Socket.io event types for client-server communication

import type { MeetingAction, MeetingState, Member } from './index.js';

// Client → Server events
export interface ClientToServerEvents {
  JOIN_MEETING: (data: JoinMeetingPayload, callback: (response: JoinMeetingResponse) => void) => void;
  LEAVE_MEETING: () => void;
  DISPATCH_ACTION: (data: DispatchActionPayload, callback: (response: ActionResponse) => void) => void;
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
  token: string; // JWT from email verification
}

export interface JoinMeetingResponse {
  success: boolean;
  state?: MeetingState;
  stateVersion?: number;
  members?: Member[];
  error?: string;
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
  | 'CONCURRENCY_CONFLICT';

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
  meetingCode: string | null;
  role: 'member' | 'chair' | 'admin';
}
