import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode
} from 'react';
import { io, Socket } from 'socket.io-client';
import type { MeetingState, MeetingAction, Member } from '../types';
import { initialState } from '../reducer/initialState';

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
  JOIN_MEETING: (data: { meetingCode: string; token: string }, callback: (response: JoinMeetingResponse) => void) => void;
  LEAVE_MEETING: () => void;
  DISPATCH_ACTION: (data: { action: MeetingAction; clientSequence: number }, callback: (response: ActionResponse) => void) => void;
  REQUEST_STATE: (callback: (response: { success: boolean; state?: MeetingState; stateVersion?: number; error?: string }) => void) => void;
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
  isAuthenticated: boolean;
  currentUser: Member | null;
  connectedMembers: Member[];
  error: string | null;
  login: (email: string, name: string, meetingCode: string) => Promise<void>;
  verifyCode: (code: string) => Promise<boolean>;
  logout: () => void;
  reconnect: () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface AuthState {
  email: string;
  name: string;
  meetingCode: string;
  token: string | null;
  userId: number | null;
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [state, setState] = useState<MeetingState>(initialState);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedMembers, setConnectedMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clientSequence, setClientSequence] = useState(0);

  // Ref to track if we're currently connecting to prevent duplicate connections
  const isConnectingRef = useRef(false);
  const socketRef = useRef<TypedSocket | null>(null);

  // Don't restore token on mount - require fresh login each session
  // This prevents stale token issues where we have token but no meetingCode
  const [authState, setAuthState] = useState<AuthState>({
    email: '',
    name: '',
    meetingCode: '',
    token: null,
    userId: null
  });

  // User needs both token AND meetingCode to be considered authenticated
  const isAuthenticated = !!(authState.token && authState.meetingCode);

  // Memoize currentUser to prevent object recreation on every render
  const currentUser = useMemo(() => {
    if (!authState.userId) return null;
    const foundMember = state.members.find(m => m.id === authState.userId);
    if (foundMember) return foundMember;
    return {
      id: authState.userId,
      name: authState.name,
      role: 'member' as const,
      present: true
    };
  }, [authState.userId, authState.name, state.members]);

  // Request verification code
  const login = useCallback(async (email: string, name: string, meetingCode: string) => {
    setError(null);
    try {
      const response = await fetch(`${SERVER_URL}/api/auth/request-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, meetingCode })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code');
      }

      setAuthState(prev => ({ ...prev, email, name, meetingCode }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification code');
      throw err;
    }
  }, []);

  // Verify code and get token
  const verifyCode = useCallback(async (code: string): Promise<boolean> => {
    setError(null);
    try {
      const response = await fetch(`${SERVER_URL}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authState.email,
          code,
          meetingCode: authState.meetingCode
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Invalid verification code');
      }

      // Store token
      localStorage.setItem('authToken', data.token);
      setAuthState(prev => ({
        ...prev,
        token: data.token,
        userId: data.user.id
      }));

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      return false;
    }
  }, [authState.email, authState.meetingCode]);

  // Logout
  const logout = useCallback(() => {
    localStorage.removeItem('authToken');
    if (socketRef.current) {
      socketRef.current.emit('LEAVE_MEETING');
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    isConnectingRef.current = false;
    setSocket(null);
    setAuthState({
      email: '',
      name: '',
      meetingCode: '',
      token: null,
      userId: null
    });
    setState(initialState);
    setIsConnected(false);
    setConnectedMembers([]);
  }, []);

  // Connect to socket when authenticated
  useEffect(() => {
    if (!authState.token || !authState.meetingCode) return;

    // Prevent duplicate connections
    if (isConnectingRef.current || socketRef.current?.connected) {
      console.log('Socket connection already in progress or connected');
      return;
    }

    isConnectingRef.current = true;
    console.log('Creating new socket connection...');

    const newSocket: TypedSocket = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      console.log('Socket connected, joining meeting...');

      // Join meeting
      newSocket.emit('JOIN_MEETING', {
        meetingCode: authState.meetingCode,
        token: authState.token!
      }, (response) => {
        isConnectingRef.current = false;
        if (response.success) {
          console.log('Successfully joined meeting');
          setState(response.state!);
          setConnectedMembers(response.members || []);
          setIsConnected(true);
          setError(null);
          setSocket(newSocket);
        } else {
          console.error('Failed to join meeting:', response.error);
          setError(response.error || 'Failed to join meeting');
          if (response.error?.includes('Invalid token')) {
            // Clear auth state on invalid token
            localStorage.removeItem('authToken');
            newSocket.disconnect();
            socketRef.current = null;
            setAuthState({
              email: '',
              name: '',
              meetingCode: '',
              token: null,
              userId: null
            });
          }
        }
      });
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      isConnectingRef.current = false;
      setError(`Connection error: ${err.message}`);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
      isConnectingRef.current = false;
    });

    newSocket.on('STATE_UPDATE', (data: StateUpdatePayload) => {
      setState(data.state);
    });

    newSocket.on('MEMBER_JOINED', ({ member }) => {
      setConnectedMembers(prev => {
        if (prev.find(m => m.id === member.id)) return prev;
        return [...prev, member];
      });
    });

    newSocket.on('MEMBER_LEFT', ({ member }) => {
      setConnectedMembers(prev => prev.filter(m => m.id !== member.id));
    });

    newSocket.on('ACTION_REJECTED', ({ reason }) => {
      setError(reason);
      setTimeout(() => setError(null), 5000);
    });

    newSocket.on('ERROR', ({ message }) => {
      setError(message);
    });

    return () => {
      console.log('Cleaning up socket connection');
      isConnectingRef.current = false;
      socketRef.current = null;
      newSocket.disconnect();
    };
  }, [authState.token, authState.meetingCode]);

  // Dispatch action through socket
  const dispatch = useCallback(async (action: MeetingAction): Promise<boolean> => {
    const currentSocket = socketRef.current;
    if (!currentSocket || !isConnected) {
      setError('Not connected to server');
      return false;
    }

    const sequence = clientSequence + 1;
    setClientSequence(sequence);

    return new Promise((resolve) => {
      currentSocket.emit('DISPATCH_ACTION', { action, clientSequence: sequence }, (response) => {
        if (response.success) {
          resolve(true);
        } else {
          setError(response.error || 'Action failed');
          setTimeout(() => setError(null), 5000);
          resolve(false);
        }
      });
    });
  }, [isConnected, clientSequence]);

  // Reconnect
  const reconnect = useCallback(() => {
    if (socketRef.current && !socketRef.current.connected) {
      socketRef.current.connect();
    }
  }, []);

  const value: SocketContextValue = {
    state,
    dispatch,
    isConnected,
    isAuthenticated,
    currentUser,
    connectedMembers,
    error,
    login,
    verifyCode,
    logout,
    reconnect
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
