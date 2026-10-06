import { useEffect, useCallback, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { TypedSocket, AuthState, StateUpdatePayload } from '../types/socket';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface UseSocketConnectionReturn {
  state: MeetingState;
  isConnected: boolean;
  connectedMembers: Member[];
  error: string | null;
  dispatch: (action: MeetingAction) => Promise<boolean>;
  reconnect: () => void;
  disconnect: () => void;
  setError: (error: string | null) => void;
}

export function useSocketConnection(
  authState: AuthState,
  onInvalidToken: () => void,
): UseSocketConnectionReturn {
  const [state, setState] = useState<MeetingState>(initialState);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedMembers, setConnectedMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clientSequence, setClientSequence] = useState(0);

  const isConnectingRef = useRef(false);
  const socketRef = useRef<TypedSocket | null>(null);
  // Version of the state on screen, so an update that arrives late can't roll it back
  const stateVersionRef = useRef(0);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read the latest onInvalidToken through a ref so a caller passing a new function each
  // render doesn't re-run the connection effect (which would reconnect the socket)
  const onInvalidTokenRef = useRef(onInvalidToken);
  useEffect(() => {
    onInvalidTokenRef.current = onInvalidToken;
  }, [onInvalidToken]);

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

  // Connect to socket when authenticated
  useEffect(() => {
    if (!authState.token || !authState.meetingCode) return;

    if (isConnectingRef.current || socketRef.current?.connected) {
      return;
    }

    isConnectingRef.current = true;

    const newSocket: TypedSocket = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      withCredentials: true,
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      newSocket.emit(
        'JOIN_MEETING',
        {
          meetingCode: authState.meetingCode,
          token: authState.token!,
        },
        (response) => {
          isConnectingRef.current = false;
          if (response.success) {
            stateVersionRef.current = response.stateVersion ?? 0;
            setState(response.state!);
            setConnectedMembers(response.members || []);
            setIsConnected(true);
            setError(null);
          } else {
            setError(response.error || 'Failed to join meeting');
            if (response.error?.includes('Invalid token')) {
              onInvalidTokenRef.current();
              newSocket.disconnect();
              socketRef.current = null;
            }
          }
        },
      );
    });

    newSocket.on('connect_error', (err) => {
      isConnectingRef.current = false;
      setError(`Connection error: ${err.message}`);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      isConnectingRef.current = false;
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

    return () => {
      isConnectingRef.current = false;
      socketRef.current = null;
      newSocket.disconnect();
    };
  }, [authState.token, authState.meetingCode, setTemporaryError]);

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
    setConnectedMembers([]);
  }, []);

  return {
    state,
    isConnected,
    connectedMembers,
    error,
    dispatch,
    reconnect,
    disconnect,
    setError,
  };
}
