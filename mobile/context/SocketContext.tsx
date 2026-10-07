import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import { io, Socket } from 'socket.io-client';
import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { getMeetingCode, storeMeetingCode } from '../lib/storage';
import { getApiUrl } from '../lib/api';
import { useSession } from './SessionContext';

// Socket event types (matching server)
interface StateUpdatePayload {
  state: MeetingState;
  stateVersion: number;
  triggeredBy?: {
    actionType: string;
    userId: number;
  };
}

interface JoinMeetingResponse {
  success: boolean;
  state?: MeetingState;
  stateVersion?: number;
  members?: Member[];
  error?: string;
}

interface ActionResponse {
  success: boolean;
  stateVersion?: number;
  error?: string;
}

interface ClientToServerEvents {
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

interface ServerToClientEvents {
  STATE_UPDATE: (data: StateUpdatePayload) => void;
  ACTION_REJECTED: (data: { clientSequence: number; reason: string; errorCode: string }) => void;
  MEMBER_JOINED: (data: { member: Member; timestamp: string }) => void;
  MEMBER_LEFT: (data: { member: Member; timestamp: string }) => void;
  ERROR: (data: { message: string; code: string }) => void;
}

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketContextValue {
  state: MeetingState;
  dispatch: (action: MeetingAction) => Promise<boolean>;
  isConnected: boolean;
  /** True while the signed-in user's remembered meeting is being looked up */
  isLoading: boolean;
  currentUser: Member | null;
  connectedMembers: Member[];
  error: string | null;
  meetingCode: string | null;
  joinMeeting: (code: string) => void;
  leaveMeeting: () => void;
  reconnect: () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

/** The meeting connection for the signed-in user. The session token authenticates the socket. */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, user, termsAccepted, signOut, markTermsNotAccepted } = useSession();
  const userId = user?.id ?? null;

  const [state, setState] = useState<MeetingState>(initialState);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedMembers, setConnectedMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clientSequence, setClientSequence] = useState(0);
  // The meeting joined, with the user who joined it: after a sign-out or a different user
  // signing in, it no longer applies
  const [joined, setJoined] = useState<{ userId: number; code: string } | null>(null);
  // The user whose remembered meeting has been looked up
  const [restoredFor, setRestoredFor] = useState<number | null>(null);

  const meetingCode = joined && joined.userId === userId ? joined.code : null;
  const isLoading = userId !== null && restoredFor !== userId;

  // Ref to track if we're currently connecting to prevent duplicate connections
  const isConnectingRef = useRef(false);
  const socketRef = useRef<TypedSocket | null>(null);
  // Version of the state on screen, so an update that arrives late can't roll it back
  const stateVersionRef = useRef(0);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read the latest signOut through a ref, so a new function from the session doesn't re-run
  // the connection effect (which would reconnect the socket)
  const signOutRef = useRef(signOut);
  useEffect(() => {
    signOutRef.current = signOut;
  }, [signOut]);

  const markTermsNotAcceptedRef = useRef(markTermsNotAccepted);
  useEffect(() => {
    markTermsNotAcceptedRef.current = markTermsNotAccepted;
  }, [markTermsNotAccepted]);

  // Helper to set error with auto-clear
  const setTemporaryError = useCallback((message: string, duration = 5000) => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    setError(message);
    errorTimeoutRef.current = setTimeout(() => {
      setError(null);
      errorTimeoutRef.current = null;
    }, duration);
  }, []);

  // Cleanup error timeout on unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  // Rejoin the meeting this user was in when the app last closed
  useEffect(() => {
    if (userId === null) return;
    let current = true;
    getMeetingCode(userId)
      .catch(() => null)
      .then((code) => {
        if (!current) return;
        // A meeting joined while this was loading wins over the remembered one
        if (code) setJoined((prev) => (prev && prev.userId === userId ? prev : { userId, code }));
        setRestoredFor(userId);
      });
    return () => {
      current = false;
    };
  }, [userId]);

  const currentUser = useMemo<Member | null>(() => {
    if (!user) return null;
    return (
      state.members.find((m) => m.id === user.id) ?? {
        id: user.id,
        name: user.name ?? user.email,
        role: 'member',
        present: true,
      }
    );
  }, [user, state.members]);

  // Connect to the meeting once signed in, with the current terms accepted and a meeting code
  useEffect(() => {
    if (!token || !termsAccepted || !meetingCode) return;

    // Prevent duplicate connections
    if (isConnectingRef.current || socketRef.current?.connected) {
      return;
    }

    isConnectingRef.current = true;

    const newSocket: TypedSocket = io(getApiUrl(), {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      // No cookies in React Native: the session token goes in the handshake
      auth: { token },
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      newSocket.emit('JOIN_MEETING', { meetingCode }, (response) => {
        isConnectingRef.current = false;
        if (response.success) {
          stateVersionRef.current = response.stateVersion ?? 0;
          setState(response.state!);
          setConnectedMembers(response.members || []);
          setIsConnected(true);
          setError(null);
        } else {
          setError(response.error || 'Failed to join meeting');
        }
      });
    });

    newSocket.on('connect_error', (err) => {
      isConnectingRef.current = false;
      // The session ended (signed out everywhere, or expired): back to sign-in
      if (err.message === 'Not signed in') {
        void signOutRef.current();
        return;
      }
      // The current terms aren't accepted: the root layout shows the terms screen, and this
      // connects again once they are
      if (err.data?.code === 'TERMS_NOT_ACCEPTED') {
        markTermsNotAcceptedRef.current();
        return;
      }
      setError(`Connection error: ${err.message}`);
    });

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false);
      isConnectingRef.current = false;
      // The server ended the connection (the session was signed out elsewhere) and socket.io
      // won't reconnect on its own. Reconnecting is then refused as not signed in, which signs
      // out here too.
      if (reason === 'io server disconnect') setError('Disconnected by the server.');
    });

    newSocket.on('STATE_UPDATE', (data: StateUpdatePayload) => {
      if (data.stateVersion < stateVersionRef.current) return;
      stateVersionRef.current = data.stateVersion;
      setState(data.state);
    });

    newSocket.on('MEMBER_JOINED', ({ member }) => {
      setConnectedMembers((prev) => {
        if (prev.find((m) => m.id === member.id)) return prev;
        return [...prev, member];
      });
    });

    newSocket.on('MEMBER_LEFT', ({ member }) => {
      setConnectedMembers((prev) => prev.filter((m) => m.id !== member.id));
    });

    newSocket.on('ACTION_REJECTED', ({ reason }) => {
      setTemporaryError(reason);
    });

    newSocket.on('ERROR', ({ message }) => {
      setError(message);
    });

    return () => {
      isConnectingRef.current = false;
      socketRef.current = null;
      newSocket.disconnect();
      // Signed out, left, or switched meetings: don't show this meeting any more
      stateVersionRef.current = 0;
      setState(initialState);
      setIsConnected(false);
      setConnectedMembers([]);
    };
  }, [token, termsAccepted, meetingCode, setTemporaryError]);

  // Dispatch action through socket with timeout
  const dispatch = useCallback(
    async (action: MeetingAction): Promise<boolean> => {
      const currentSocket = socketRef.current;
      if (!currentSocket || !isConnected) {
        setError('Not connected to server');
        return false;
      }

      const sequence = clientSequence + 1;
      setClientSequence(sequence);

      const TIMEOUT_MS = 10000;

      return new Promise<boolean>((resolve) => {
        // Cleared when the server answers, so the timeout only reports an unanswered action
        const timer = setTimeout(() => {
          setTemporaryError('Action timed out. Please try again.');
          resolve(false);
        }, TIMEOUT_MS);

        currentSocket.emit('DISPATCH_ACTION', { action, clientSequence: sequence }, (response) => {
          clearTimeout(timer);
          if (response.success) {
            resolve(true);
          } else {
            setTemporaryError(response.error || 'Action failed');
            resolve(false);
          }
        });
      });
    },
    [isConnected, clientSequence, setTemporaryError],
  );

  // Reconnect. A socket that is connected but not in the meeting (its join failed) is cycled,
  // since joining happens on connect.
  const reconnect = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (socket.connected) socket.disconnect();
    setError(null);
    socket.connect();
  }, []);

  const joinMeeting = useCallback(
    (code: string) => {
      if (userId === null) return;
      const normalized = code.trim().toUpperCase();
      // Don't show the last meeting's error while connecting to this one
      setError(null);
      void storeMeetingCode(userId, normalized).catch(() => {
        // The meeting just isn't remembered across restarts
      });
      // The same code again (after a failed join) doesn't change the connection, so retry it
      if (normalized === meetingCode) reconnect();
      else setJoined({ userId, code: normalized });
    },
    [userId, meetingCode, reconnect],
  );

  const leaveMeeting = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('LEAVE_MEETING');
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    isConnectingRef.current = false;
    if (userId !== null) {
      void storeMeetingCode(userId, null).catch(() => {});
    }
    setJoined(null);
  }, [userId]);

  // Memoize the context value
  const value = useMemo<SocketContextValue>(
    () => ({
      state,
      dispatch,
      isConnected,
      isLoading,
      currentUser,
      connectedMembers,
      error,
      meetingCode,
      joinMeeting,
      leaveMeeting,
      reconnect,
    }),
    [
      state,
      dispatch,
      isConnected,
      isLoading,
      currentUser,
      connectedMembers,
      error,
      meetingCode,
      joinMeeting,
      leaveMeeting,
      reconnect,
    ],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
