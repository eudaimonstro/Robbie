import { useEffect, useCallback, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { JoinError, TypedSocket, StateUpdatePayload } from '../types/socket';
import { TERMS_NOT_ACCEPTED } from '../../../api/client';

// Unset in development: the socket connects to the page's own origin, which Vite proxies
const SERVER_URL: string | undefined = import.meta.env.VITE_SERVER_URL;

interface UseSocketConnectionReturn {
  state: MeetingState;
  isConnected: boolean;
  /** The meeting was joined on this page: a later disconnect is a dropped connection */
  hasJoined: boolean;
  connectedMembers: Member[];
  error: string | null;
  /** Why the last join was refused, with the server's error code */
  joinError: JoinError | null;
  dispatch: (action: MeetingAction) => Promise<boolean>;
  reconnect: () => void;
  disconnect: () => void;
  setError: (error: string | null) => void;
}

export function useSocketConnection(
  meetingCode: string | null,
  onNotSignedIn: () => void,
  onTermsNotAccepted?: () => void,
  // display: a TV or projector, which follows the meeting without becoming a member of it
  options: { display?: boolean } = {},
): UseSocketConnectionReturn {
  const display = options.display === true;
  const [state, setState] = useState<MeetingState>(initialState);
  const [joinError, setJoinError] = useState<JoinError | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [connectedMembers, setConnectedMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clientSequence, setClientSequence] = useState(0);

  const isConnectingRef = useRef(false);
  const socketRef = useRef<TypedSocket | null>(null);
  // Version of the state on screen, so an update that arrives late can't roll it back
  const stateVersionRef = useRef(0);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read the latest onNotSignedIn through a ref so a caller passing a new function each
  // render doesn't re-run the connection effect (which would reconnect the socket)
  const onNotSignedInRef = useRef(onNotSignedIn);
  useEffect(() => {
    onNotSignedInRef.current = onNotSignedIn;
  }, [onNotSignedIn]);
  const onTermsNotAcceptedRef = useRef(onTermsNotAccepted);
  useEffect(() => {
    onTermsNotAcceptedRef.current = onTermsNotAccepted;
  }, [onTermsNotAccepted]);

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

  // Connect to the meeting's socket. The session cookie authenticates it.
  useEffect(() => {
    if (!meetingCode) return;

    if (isConnectingRef.current || socketRef.current?.connected) {
      return;
    }

    isConnectingRef.current = true;

    // A display on the wall and a phone in a pocket are left alone for hours: they keep trying
    // (socket.io backs off to one attempt every five seconds)
    const options = {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      withCredentials: true,
    };
    const newSocket: TypedSocket = SERVER_URL ? io(SERVER_URL, options) : io(options);

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      // Members join with the code alone, as the mobile app does; a display says it is one
      const payload = display ? { meetingCode, display: true } : { meetingCode };
      newSocket.emit('JOIN_MEETING', payload, (response) => {
        isConnectingRef.current = false;
        if (response.success) {
          stateVersionRef.current = response.stateVersion ?? 0;
          setState(response.state!);
          setConnectedMembers(response.members || []);
          setIsConnected(true);
          setHasJoined(true);
          setError(null);
          setJoinError(null);
        } else {
          const message = response.error || 'Failed to join meeting';
          setError(message);
          setJoinError({ message, code: response.errorCode ?? null });
        }
      });
    });

    newSocket.on('connect_error', (err) => {
      isConnectingRef.current = false;
      if (err.message === 'Not signed in') {
        onNotSignedInRef.current();
        return;
      }
      // The user hasn't accepted the current terms: the app shows the terms step, and this
      // connects again once they have
      if (err.data?.code === TERMS_NOT_ACCEPTED) {
        onTermsNotAcceptedRef.current?.();
        return;
      }
      setError(`Connection error: ${err.message}`);
    });

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false);
      isConnectingRef.current = false;
      // The server ended the connection (the session was signed out elsewhere) and socket.io
      // won't reconnect on its own. Show the error so Try again appears; if the session is
      // gone, that retry is refused as not signed in, which goes to sign-in.
      if (reason === 'io server disconnect') setError('Disconnected by the server.');
    });

    newSocket.on('STATE_UPDATE', (data: StateUpdatePayload) => {
      if (data.stateVersion < stateVersionRef.current) return;
      stateVersionRef.current = data.stateVersion;
      setState(data.state);
      setConnectedMembers(data.state.members.filter((m) => m.present));
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

    // Back online, or the page shown again (a phone woken, a tab brought forward): connect now
    // rather than wait for the next attempt, or at all once socket.io has stopped (the server
    // ended the connection)
    const connectNow = () => {
      if (!newSocket.connected) newSocket.connect();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') connectNow();
    };
    window.addEventListener('online', connectNow);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.removeEventListener('online', connectNow);
      document.removeEventListener('visibilitychange', onVisible);
      isConnectingRef.current = false;
      socketRef.current = null;
      newSocket.disconnect();
    };
  }, [meetingCode, display, setTemporaryError]);

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
    setJoinError(null);
    socket.connect();
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('LEAVE_MEETING');
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    isConnectingRef.current = false;
    setState(initialState);
    setIsConnected(false);
    setHasJoined(false);
    setConnectedMembers([]);
  }, []);

  return {
    state,
    isConnected,
    hasJoined,
    connectedMembers,
    error,
    joinError,
    dispatch,
    reconnect,
    disconnect,
    setError,
  };
}
