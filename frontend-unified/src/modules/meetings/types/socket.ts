import type { Socket } from 'socket.io-client';
import type {
  MeetingState,
  MeetingAction,
  MeetingRole,
  Member,
} from '@robbie-bylawyer/shared/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@robbie-bylawyer/shared/types/socket';
import type { AttendanceSummary } from '@robbie-bylawyer/shared/utils';

// The protocol (events and payloads) is shared with the server in shared/types/socket.ts; only
// the client's own types are here
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
  /**
   * The meeting was joined on this page: while disconnected after that, the screens keep the
   * last state and say they are reconnecting
   */
  hasJoined: boolean;
  /** The signed-in user as a member of the meeting; null on a display */
  currentUser: Member | null;
  connectedMembers: Member[];
  error: string | null;
  /** Why the last join was refused, or null */
  joinError: JoinError | null;
  /**
   * The meeting was canceled while it was open, with what the server said: the connection is
   * closed for good, and the screens say so with the way back to Live Meetings
   */
  canceled: string | null;
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
