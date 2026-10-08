import { useEffect, useCallback, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { JoinMeetingResponse, StateUpdatePayload } from '@robbie-bylawyer/shared/types/socket';
import type { JoinError, TypedSocket } from '../types/socket';
import { TERMS_NOT_ACCEPTED } from '../../../api/client';
import { mergeStateUpdate } from './stateUpdates';

/** The ERROR code the server sends the room of a meeting canceled while it is open */
const MEETING_CANCELED = 'MEETING_CANCELED';

// Unset in development: the socket connects to the page's own origin, which Vite proxies
const SERVER_URL: string | undefined = import.meta.env.VITE_SERVER_URL;

/**
 * A page hidden this long (a phone locked, the browser in the background) has most likely lost
 * its connection without knowing it yet: the server drops a connection that hasn't answered for
 * 20 seconds (its ping interval and timeout). Shown again, it connects afresh at once.
 */
export const STALE_AFTER_HIDDEN_MS = 20_000;
/** The longest wait between tries of a join the server refused for now */
const MAX_JOIN_RETRY_MS = 30_000;
/** How long an action waits for the server's answer */
const ACTION_TIMEOUT_MS = 10_000;

/** A refusal that clears by itself (too many joins for now, the server's own failure) */
function retryable(response: JoinMeetingResponse): boolean {
  return response.errorCode === 'RATE_LIMITED' || response.retryAfterMs !== undefined;
}

interface UseSocketConnectionReturn {
  state: MeetingState;
  isConnected: boolean;
  /** The meeting was joined on this page: a later disconnect is a dropped connection */
  hasJoined: boolean;
  connectedMembers: Member[];
  error: string | null;
  /** Why the last join was refused, with the server's error code */
  joinError: JoinError | null;
  /** The meeting was canceled while open, with what the server said: it is left for good */
  canceled: string | null;
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
  const [canceled, setCanceled] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  // The browser says the device has no network: shown as a dropped connection at once, without
  // waiting for the socket to notice
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false,
  );
  const [hasJoined, setHasJoined] = useState(false);
  const [connectedMembers, setConnectedMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clientSequence, setClientSequence] = useState(0);

  const isConnectingRef = useRef(false);
  const socketRef = useRef<TypedSocket | null>(null);
  // Version of the state on screen, so an update that arrives late can't roll it back
  const stateVersionRef = useRef(0);
  // The state on screen, which each update builds on (an update carries only the history added)
  const stateRef = useRef<MeetingState>(initialState);
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

  /** Put a whole state on screen */
  const showState = useCallback((next: MeetingState, version: number) => {
    stateVersionRef.current = version;
    stateRef.current = next;
    setState(next);
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

    // The join on this connection has been answered: updates before it are only noted (the
    // newest version), since they build on a state this page doesn't have yet
    let joined = false;
    let newestBeforeJoin = 0;
    // A join refused for now is tried again after a wait that grows
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;
    let everJoined = false;
    // One request for the whole state at a time
    let requesting = false;

    const clearRetry = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    };

    // The whole state, when an update can't be applied to the one on screen
    const requestState = () => {
      if (requesting || !newSocket.connected) return;
      requesting = true;
      newSocket.emit('REQUEST_STATE', (response) => {
        requesting = false;
        if (
          response.success &&
          response.state &&
          (response.stateVersion ?? 0) >= stateVersionRef.current
        ) {
          showState(response.state, response.stateVersion ?? 0);
          setConnectedMembers(response.state.members.filter((m) => m.present));
        }
      });
    };

    const join = () => {
      // Members join with the code alone, as the mobile app does; a display says it is one
      const payload = display ? { meetingCode, display: true } : { meetingCode };
      newSocket.emit('JOIN_MEETING', payload, (response) => {
        isConnectingRef.current = false;
        if (response.success) {
          clearRetry();
          retries = 0;
          joined = true;
          everJoined = true;
          showState(response.state!, response.stateVersion ?? 0);
          setConnectedMembers(response.members || []);
          setIsConnected(true);
          setHasJoined(true);
          setError(null);
          setJoinError(null);
          // The room moved on while the join was answered
          if (newestBeforeJoin > (response.stateVersion ?? 0)) requestState();
          newestBeforeJoin = 0;
          return;
        }
        if (retryable(response)) {
          // Too many joins for now, or the server's own failure: the meeting stays on screen
          // (or the connecting screen does) and the join is tried again
          const backoff = Math.min(MAX_JOIN_RETRY_MS, 1000 * 2 ** retries);
          const delay = Math.max(response.retryAfterMs ?? 0, backoff);
          retries++;
          clearRetry();
          retryTimer = setTimeout(() => {
            retryTimer = null;
            if (newSocket.connected) join();
          }, delay);
          if (!everJoined) setError(null);
          return;
        }
        const message = response.error || 'Failed to join meeting';
        setError(message);
        setJoinError({ message, code: response.errorCode ?? null });
      });
    };

    newSocket.on('connect', () => {
      joined = false;
      newestBeforeJoin = 0;
      join();
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
      joined = false;
      requesting = false;
      clearRetry();
      // The server ended the connection (the session was signed out elsewhere) and socket.io
      // won't reconnect on its own. Show the error so Try again appears; if the session is
      // gone, that retry is refused as not signed in, which goes to sign-in.
      if (reason === 'io server disconnect') setError('Disconnected by the server.');
    });

    newSocket.on('STATE_UPDATE', (data: StateUpdatePayload) => {
      if (!joined) {
        newestBeforeJoin = Math.max(newestBeforeJoin, data.stateVersion);
        return;
      }
      if (data.stateVersion < stateVersionRef.current) return;
      const merged = mergeStateUpdate(stateRef.current, stateVersionRef.current, data);
      if (!merged) {
        requestState();
        return;
      }
      showState(merged, data.stateVersion);
      setConnectedMembers(merged.members.filter((m) => m.present));
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

    // A canceled meeting is gone: the server has sent everyone out of it, and there is nothing
    // to rejoin, so the socket closes and stays closed
    let meetingCanceled = false;
    newSocket.on('ERROR', ({ message, code }) => {
      if (code === MEETING_CANCELED) {
        meetingCanceled = true;
        setCanceled(message);
        setIsConnected(false);
        setHasJoined(false);
        newSocket.disconnect();
        return;
      }
      setError(message);
    });

    // Back online, or the page shown again (a phone woken, a tab brought forward): connect now
    // rather than wait for the next attempt, or at all once socket.io has stopped (the server
    // ended the connection). A page hidden long enough to have lost its connection unnoticed
    // connects afresh, and its join brings the meeting as it is now.
    const connectNow = () => {
      if (!meetingCanceled && !newSocket.connected) newSocket.connect();
    };
    const onOnline = () => {
      setOffline(false);
      connectNow();
    };
    const onOffline = () => setOffline(true);
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        hiddenAt = Date.now();
        return;
      }
      const hiddenFor = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (!newSocket.connected) connectNow();
      else if (hiddenFor >= STALE_AFTER_HIDDEN_MS && !meetingCanceled)
        newSocket.io?.engine?.close();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
      clearRetry();
      isConnectingRef.current = false;
      socketRef.current = null;
      newSocket.disconnect();
    };
  }, [meetingCode, display, setTemporaryError, showState]);

  const connected = isConnected && !offline;

  // Dispatch action through socket with timeout
  const dispatch = useCallback(
    async (action: MeetingAction): Promise<boolean> => {
      const currentSocket = socketRef.current;
      if (!currentSocket || !connected) {
        setError(offline ? 'You are offline. Nothing was sent.' : 'Not connected to server');
        return false;
      }

      const sequence = clientSequence + 1;
      setClientSequence(sequence);

      return new Promise<boolean>((resolve) => {
        // Cleared when the server answers, so the timeout only reports an unanswered action
        const timer = setTimeout(() => {
          setTemporaryError('Action timed out. Please try again.');
          resolve(false);
        }, ACTION_TIMEOUT_MS);

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
    [connected, offline, clientSequence, setTemporaryError],
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
    showState(initialState, 0);
    setIsConnected(false);
    setHasJoined(false);
    setConnectedMembers([]);
  }, [showState]);

  return {
    state,
    isConnected: connected,
    hasJoined,
    connectedMembers,
    error,
    joinError,
    canceled,
    dispatch,
    reconnect,
    disconnect,
    setError,
  };
}
