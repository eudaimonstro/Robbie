import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Member } from '@robbie-bylawyer/shared/types';
import type { SocketContextValue } from '../types/socket';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { useSession } from '../../../context/SessionContext';

const SocketContext = createContext<SocketContextValue | null>(null);

interface SocketProviderProps {
  /** The meeting in the page's link (/meetings/:code), in upper case */
  meetingCode: string;
  children: ReactNode;
}

/**
 * The live meeting's connection. The link is the meeting: the provider connects to the code in
 * the route, so a shared link or a QR code joins after sign-in, and a reload rejoins.
 */
export function SocketProvider({ meetingCode, children }: SocketProviderProps) {
  const { user, markTermsNotAccepted } = useSession();
  const navigate = useNavigate();

  // The session ended (signed out elsewhere, or expired): sign in, then come back to this page
  const handleNotSignedIn = useCallback(() => {
    window.location.assign(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
  }, []);

  // Refused for the terms: RequireSession shows the terms step in place of this module
  const connection = useSocketConnection(meetingCode, handleNotSignedIn, markTermsNotAccepted);

  // useSocketConnection returns a new object each render, so depend on its stable fields
  const { disconnect } = connection;

  // disconnect emits LEAVE_MEETING before closing the socket
  const leaveMeeting = useCallback(() => {
    disconnect();
    navigate('/meetings');
  }, [disconnect, navigate]);

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
