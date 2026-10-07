import type { Socket } from 'socket.io-client';
import type {
  MeetingState,
  MeetingAction,
  MeetingRole,
  Member,
} from '@robbie-bylawyer/shared/types';
import type { AttendanceSummary } from '@robbie-bylawyer/shared/utils';

// Socket event types (matching server)
export interface StateUpdatePayload {
  state: MeetingState;
  stateVersion: number;
  triggeredBy?: {
    actionType: string;
    userId: number;
  };
}

export interface JoinMeetingResponse {
  success: boolean;
  state?: MeetingState;
  stateVersion?: number;
  members?: Member[];
  error?: string;
  /**
   * Why a join was refused: MEETING_NOT_FOUND (no scheduled meeting has the code), NAME_REQUIRED,
   * PERMISSION_DENIED (a display outside the organization)
   */
  errorCode?: string;
}

export interface ActionResponse {
  success: boolean;
  stateVersion?: number;
  error?: string;
}

export interface ClientToServerEvents {
  JOIN_MEETING: (
    // display: a TV or projector, which receives the meeting without becoming a member of it
    data: { meetingCode: string; display?: boolean },
    callback: (response: JoinMeetingResponse) => void,
  ) => void;
  LEAVE_MEETING: () => void;
  DISPATCH_ACTION: (
    data: { action: MeetingAction; clientSequence: number },
    callback: (response: ActionResponse) => void,
  ) => void;
  REQUEST_STATE: (
    callback: (response: {
      success: boolean;
      state?: MeetingState;
      stateVersion?: number;
      error?: string;
    }) => void,
  ) => void;
}

export interface ServerToClientEvents {
  STATE_UPDATE: (data: StateUpdatePayload) => void;
  ACTION_REJECTED: (data: { clientSequence: number; reason: string; errorCode: string }) => void;
  MEMBER_JOINED: (data: { member: Member; timestamp: string }) => void;
  MEMBER_LEFT: (data: { member: Member; timestamp: string }) => void;
  ERROR: (data: { message: string; code: string }) => void;
}

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** A join the server refused: its message, and its error code when it sent one */
export interface JoinError {
  message: string;
  code: string | null;
}

/**
 * Sends an action to the server: true once the server has applied it, false when it refused it
 * (its reason is in the connection's error) or didn't answer
 */
export type MeetingDispatch = (action: MeetingAction) => Promise<boolean>;

export interface SocketContextValue {
  state: MeetingState;
  dispatch: MeetingDispatch;
  isConnected: boolean;
  /** The signed-in user as a member of the meeting; null on a display */
  currentUser: Member | null;
  connectedMembers: Member[];
  error: string | null;
  /** Why the last join was refused, or null */
  joinError: JoinError | null;
  /** The meeting in the page's link (/meetings/:code) */
  meetingCode: string;
  /** A display follows the meeting without being a member of it */
  isDisplay: boolean;
  /**
   * The signed-in user's role in the meeting, as the server derived it and put in the state;
   * null on a display and before the join is answered
   */
  myRole: MeetingRole | null;
  /** Attendance as the server counts it (attendanceSummary in shared) */
  attendance: AttendanceSummary;
  /** Leave the meeting and go back to the Live Meetings page */
  leaveMeeting: () => void;
  reconnect: () => void;
}
