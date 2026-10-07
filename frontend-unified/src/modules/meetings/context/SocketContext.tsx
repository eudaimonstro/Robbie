import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Member } from '@robbie-bylawyer/shared/types';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { SocketContextValue } from '../types/socket';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { useSession } from '../../../context/SessionContext';

const SocketContext = createContext<SocketContextValue | null>(null);

interface SocketProviderProps {
  /** The meeting in the page's link (/meetings/:code), in upper case */
  meetingCode: string;
  /** A display (/meetings/:code/display): follows the meeting without being a member of it */
  display?: boolean;
  children: ReactNode;
}

/**
 * The live meeting's connection. The link is the meeting: the provider connects to the code in
 * the route, so a shared link or a QR code joins after sign-in, and a reload rejoins.
 */
export function SocketProvider({ meetingCode, display = false, children }: SocketProviderProps) {
  const { user, markTermsNotAccepted } = useSession();
  const navigate = useNavigate();

  // The session ended (signed out elsewhere, or expired): sign in, then come back to this page
  const handleNotSignedIn = useCallback(() => {
    window.location.assign(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
  }, []);

  // Refused for the terms: RequireSession shows the terms step in place of this module
  const connection = useSocketConnection(meetingCode, handleNotSignedIn, markTermsNotAccepted, {
    display,
  });

  // useSocketConnection returns a new object each render, so depend on its stable fields
  const { disconnect } = connection;

  // disconnect emits LEAVE_MEETING before closing the socket
  const leaveMeeting = useCallback(() => {
    disconnect();
    navigate('/meetings');
  }, [disconnect, navigate]);

  // The user as the state has them: the server derived their role at the join
  const me = useMemo<Member | null>(
    () => (user ? (connection.state.members.find((m) => m.id === user.id) ?? null) : null),
    [user, connection.state.members],
  );

  // A display is nobody in the meeting. Before the join is answered the user is not in the
  // state yet, and is shown as a guest: never offered more than the server allows.
  const currentUser = useMemo<Member | null>(() => {
    if (!user || display) return null;
    return me ?? { id: user.id, name: user.name ?? user.email, role: 'guest', present: true };
  }, [user, display, me]);

  const attendance = useMemo(() => attendanceSummary(connection.state), [connection.state]);

  const value = useMemo<SocketContextValue>(
    () => ({
      state: connection.state,
      dispatch: connection.dispatch,
      isConnected: connection.isConnected,
      currentUser,
      connectedMembers: connection.connectedMembers,
      error: connection.error,
      joinError: connection.joinError,
      meetingCode,
      isDisplay: display,
      myRole: display ? null : (me?.role ?? null),
      attendance,
      leaveMeeting,
      reconnect: connection.reconnect,
    }),
    [
      connection.state,
      connection.dispatch,
      connection.isConnected,
      connection.connectedMembers,
      connection.error,
      connection.joinError,
      connection.reconnect,
      currentUser,
      meetingCode,
      display,
      me,
      attendance,
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
