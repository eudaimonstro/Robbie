import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Member } from '@robbie-bylawyer/shared/types';
import type { SocketContextValue } from '../types/socket';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { useSession } from '../../../context/SessionContext';

const SocketContext = createContext<SocketContextValue | null>(null);
const MEETING_KEY = 'robbie_meeting_code';

function savedMeetingCode(): string | null {
  try {
    return localStorage.getItem(MEETING_KEY);
  } catch {
    return null;
  }
}

function saveMeetingCode(code: string | null) {
  try {
    if (code) localStorage.setItem(MEETING_KEY, code);
    else localStorage.removeItem(MEETING_KEY);
  } catch {
    // Storage may be unavailable; the meeting just isn't remembered across reloads
  }
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [meetingCode, setMeetingCode] = useState<string | null>(savedMeetingCode);

  // The session ended (signed out elsewhere, or expired): go to sign-in and come back here
  const handleNotSignedIn = useCallback(() => {
    window.location.assign('/sign-in?next=%2Fmeetings');
  }, []);

  const connection = useSocketConnection(meetingCode, handleNotSignedIn);

  // useSocketConnection returns a new object each render, so depend on its stable fields
  const { disconnect, setError } = connection;

  const joinMeeting = useCallback(
    (code: string) => {
      const normalized = code.trim().toUpperCase();
      // Don't show the last meeting's error while connecting to this one
      setError(null);
      saveMeetingCode(normalized);
      setMeetingCode(normalized);
    },
    [setError],
  );

  // disconnect emits LEAVE_MEETING before closing the socket
  const leaveMeeting = useCallback(() => {
    disconnect();
    saveMeetingCode(null);
    setMeetingCode(null);
  }, [disconnect]);

  const currentUser = useMemo<Member | null>(() => {
    if (!user) return null;
    return (
      connection.state.members.find((m) => m.id === user.id) ?? {
        id: user.id,
        name: user.name ?? user.email,
        role: 'member',
        present: true,
      }
    );
  }, [user, connection.state.members]);

  const value = useMemo<SocketContextValue>(
    () => ({
      state: connection.state,
      dispatch: connection.dispatch,
      isConnected: connection.isConnected,
      currentUser,
      connectedMembers: connection.connectedMembers,
      error: connection.error,
      meetingCode,
      joinMeeting,
      leaveMeeting,
      reconnect: connection.reconnect,
    }),
    [
      connection.state,
      connection.dispatch,
      connection.isConnected,
      connection.connectedMembers,
      connection.error,
      connection.reconnect,
      currentUser,
      meetingCode,
      joinMeeting,
      leaveMeeting,
    ],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
}
