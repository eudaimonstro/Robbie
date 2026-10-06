import type { Socket } from 'socket.io-client';
import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';

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
}

export interface ActionResponse {
  success: boolean;
  stateVersion?: number;
  error?: string;
}

export interface ClientToServerEvents {
  JOIN_MEETING: (
    data: { meetingCode: string },
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

export interface SocketContextValue {
  state: MeetingState;
  dispatch: (action: MeetingAction) => Promise<boolean>;
  isConnected: boolean;
  currentUser: Member | null;
  connectedMembers: Member[];
  error: string | null;
  meetingCode: string | null;
  joinMeeting: (code: string) => void;
  leaveMeeting: () => void;
  reconnect: () => void;
}
