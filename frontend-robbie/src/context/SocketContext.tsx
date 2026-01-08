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
import type { MeetingState, MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import { initialState } from '@robbie-bylawyer/shared/reducer';

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
  currentUserEmail: string | null;
  connectedMembers: Member[];
  error: string | null;
  login: (email: string, name: string, meetingCode: string) => Promise<void>;
  verifyCode: (code: string) => Promise<boolean>;
  logout: () => void;
  reconnect: () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// Validation patterns
const MEETING_CODE_PATTERN = /^[A-Z0-9]{4,8}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateMeetingCode(code: string): string | null {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return 'Meeting code is required';
  if (!MEETING_CODE_PATTERN.test(trimmed)) return 'Meeting code must be 4-8 alphanumeric characters';
  return null;
}

function validateEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return 'Email is required';
  if (!EMAIL_PATTERN.test(trimmed)) return 'Please enter a valid email address';
  return null;
}

function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Name is required';
  if (trimmed.length < 2) return 'Name must be at least 2 characters';
  if (trimmed.length > 100) return 'Name must be 100 characters or less';
  return null;
}

function validateVerificationCode(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed) return 'Verification code is required';
  if (!/^\d{6}$/.test(trimmed)) return 'Verification code must be 6 digits';
  return null;
}

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
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to set error with auto-clear
  const setTemporaryError = useCallback((message: string, duration = 5000) => {
    // Clear any existing timeout
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

  // Restore auth state from localStorage on mount
  const [authState, setAuthState] = useState<AuthState>(() => {
    try {
      const saved = localStorage.getItem('robbie_auth');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate the saved state has required fields
        if (parsed.token && parsed.meetingCode && parsed.email && parsed.userId) {
          return parsed;
        }
      }
    } catch {
      // Invalid stored data, ignore
    }
    return {
      email: '',
      name: '',
      meetingCode: '',
      token: null,
      userId: null
    };
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

    // Sanitize inputs
    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedName = name.trim();
    const sanitizedCode = meetingCode.trim().toUpperCase();

    // Validate inputs
    const emailError = validateEmail(sanitizedEmail);
    if (emailError) {
      setError(emailError);
      throw new Error(emailError);
    }

    const nameError = validateName(sanitizedName);
    if (nameError) {
      setError(nameError);
      throw new Error(nameError);
    }

    const codeError = validateMeetingCode(sanitizedCode);
    if (codeError) {
      setError(codeError);
      throw new Error(codeError);
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/auth/request-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies for CORS
        body: JSON.stringify({
          email: sanitizedEmail,
          name: sanitizedName,
          meetingCode: sanitizedCode
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code');
      }

      setAuthState(prev => ({
        ...prev,
        email: sanitizedEmail,
        name: sanitizedName,
        meetingCode: sanitizedCode
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification code');
      throw err;
    }
  }, []);

  // Verify code and get token
  const verifyCode = useCallback(async (code: string): Promise<boolean> => {
    setError(null);

    // Validate code format
    const codeError = validateVerificationCode(code);
    if (codeError) {
      setError(codeError);
      return false;
    }

    const sanitizedCode = code.trim();

    try {
      const response = await fetch(`${SERVER_URL}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies - server sets HttpOnly auth_token cookie
        body: JSON.stringify({
          email: authState.email,
          code: sanitizedCode,
          meetingCode: authState.meetingCode
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Invalid verification code');
      }

      // Token is now also stored in HttpOnly cookie by server
      // We keep it in state for Socket.io handshake (fallback)
      const newAuthState = {
        email: authState.email,
        name: authState.name,
        meetingCode: authState.meetingCode,
        token: data.token,
        userId: data.user.id
      };
      setAuthState(newAuthState);

      // Persist auth state for page reload recovery
      try {
        localStorage.setItem('robbie_auth', JSON.stringify(newAuthState));
      } catch {
        // localStorage may be unavailable in some contexts
      }

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      return false;
    }
  }, [authState.email, authState.meetingCode]);

  // Logout
  const logout = useCallback(() => {
    // Clear auth_token cookie by calling logout endpoint
    fetch(`${SERVER_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    }).catch((err) => {
      // Log logout failures but continue with local cleanup
      console.warn('Logout request failed:', err.message || 'Network error');
    });

    // Clear persisted auth state
    try {
      localStorage.removeItem('robbie_auth');
    } catch {
      // localStorage may be unavailable
    }

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
      return;
    }

    isConnectingRef.current = true;

    const newSocket: TypedSocket = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      withCredentials: true // Include cookies for HttpOnly auth
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      // Join meeting
      newSocket.emit('JOIN_MEETING', {
        meetingCode: authState.meetingCode,
        token: authState.token!
      }, (response) => {
        isConnectingRef.current = false;
        if (response.success) {
          setState(response.state!);
          setConnectedMembers(response.members || []);
          setIsConnected(true);
          setError(null);
          setSocket(newSocket);
        } else {
          setError(response.error || 'Failed to join meeting');
          if (response.error?.includes('Invalid token')) {
            // Clear auth state on invalid token
            try {
              localStorage.removeItem('robbie_auth');
            } catch {
              // localStorage may be unavailable
            }
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
      isConnectingRef.current = false;
      setError(`Connection error: ${err.message}`);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      isConnectingRef.current = false;
    });

    newSocket.on('STATE_UPDATE', (data: StateUpdatePayload) => {
      setState(data.state);
      // Sync connectedMembers from state to prevent divergence with MEMBER_JOINED/LEFT events
      // STATE_UPDATE is the source of truth for member presence
      setConnectedMembers(data.state.members.filter(m => m.present));
    });

    newSocket.on('MEMBER_JOINED', ({ member }) => {
      // Optimistic update - STATE_UPDATE will sync to source of truth
      setConnectedMembers(prev => {
        if (prev.find(m => m.id === member.id)) return prev;
        return [...prev, member];
      });
    });

    newSocket.on('MEMBER_LEFT', ({ member }) => {
      // Optimistic update - STATE_UPDATE will sync to source of truth
      setConnectedMembers(prev => prev.filter(m => m.id !== member.id));
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
  const dispatch = useCallback(async (action: MeetingAction): Promise<boolean> => {
    const currentSocket = socketRef.current;
    if (!currentSocket || !isConnected) {
      setError('Not connected to server');
      return false;
    }

    const sequence = clientSequence + 1;
    setClientSequence(sequence);

    const TIMEOUT_MS = 10000; // 10 second timeout

    const actionPromise = new Promise<boolean>((resolve) => {
      currentSocket.emit('DISPATCH_ACTION', { action, clientSequence: sequence }, (response) => {
        if (response.success) {
          resolve(true);
        } else {
          setTemporaryError(response.error || 'Action failed');
          resolve(false);
        }
      });
    });

    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        setTemporaryError('Action timed out. Please try again.');
        resolve(false);
      }, TIMEOUT_MS);
    });

    return Promise.race([actionPromise, timeoutPromise]);
  }, [isConnected, clientSequence, setTemporaryError]);

  // Reconnect
  const reconnect = useCallback(() => {
    if (socketRef.current && !socketRef.current.connected) {
      socketRef.current.connect();
    }
  }, []);

  // Memoize the context value to prevent unnecessary re-renders of consumers
  const value = useMemo<SocketContextValue>(() => ({
    state,
    dispatch,
    isConnected,
    isAuthenticated,
    currentUser,
    currentUserEmail: authState.email || null,
    connectedMembers,
    error,
    login,
    verifyCode,
    logout,
    reconnect
  }), [state, dispatch, isConnected, isAuthenticated, currentUser, authState.email, connectedMembers, error, login, verifyCode, logout, reconnect]);

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
