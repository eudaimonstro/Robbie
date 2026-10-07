import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Member } from '@robbie-bylawyer/shared/types';
import type { SocketContextValue } from '../types/socket';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { useSession } from '../../../context/SessionContext';

const SocketContext = createContext<SocketContextValue | null>(null);
const MEETING_KEY = 'robbie_meeting_code';

// The remembered meeting belongs to the user who joined it, so someone else signing in on the
// same browser starts at the join screen instead of in the previous user's meeting
function savedMeetingCode(userId: number | undefined): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(MEETING_KEY) ?? 'null') as {
      userId?: number;
      code?: string;
    } | null;
    return saved && saved.userId === userId && saved.code ? saved.code : null;
  } catch {
    return null;
  }
}

function saveMeetingCode(userId: number | undefined, code: string | null) {
  try {
    if (code && userId) localStorage.setItem(MEETING_KEY, JSON.stringify({ userId, code }));
    else localStorage.removeItem(MEETING_KEY);
  } catch {
    // Storage may be unavailable; the meeting just isn't remembered across reloads
  }
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, markTermsNotAccepted } = useSession();
  const [meetingCode, setMeetingCode] = useState<string | null>(() => savedMeetingCode(user?.id));

  // The session ended (signed out elsewhere, or expired): go to sign-in and come back here
  const handleNotSignedIn = useCallback(() => {
    window.location.assign('/sign-in?next=%2Fmeetings');
  }, []);

  // Refused for the terms: RequireSession shows the terms step in place of this module
  const connection = useSocketConnection(meetingCode, handleNotSignedIn, markTermsNotAccepted);

  // useSocketConnection returns a new object each render, so depend on its stable fields
  const { disconnect, setError } = connection;

  const joinMeeting = useCallback(
    (code: string) => {
      const normalized = code.trim().toUpperCase();
      // Don't show the last meeting's error while connecting to this one
      setError(null);
      saveMeetingCode(user?.id, normalized);
      setMeetingCode(normalized);
    },
    [setError, user?.id],
  );

  // disconnect emits LEAVE_MEETING before closing the socket
  const leaveMeeting = useCallback(() => {
    disconnect();
    saveMeetingCode(user?.id, null);
    setMeetingCode(null);
  }, [disconnect, user?.id]);

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
