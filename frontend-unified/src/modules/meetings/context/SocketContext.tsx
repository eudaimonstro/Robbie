import { createContext, useContext, useCallback, useMemo, type ReactNode } from 'react';
import type { SocketContextValue } from '../types/socket';
import { useAuth, useCurrentUser } from '../hooks/useAuth';
import { useSocketConnection } from '../hooks/useSocketConnection';

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  // Auth state and handlers
  const auth = useAuth();

  // Clear auth on invalid token (called by socket connection)
  const handleInvalidToken = useCallback(() => {
    auth.clearAuth();
  }, [auth]);

  // Socket connection - takes auth state and invalid token handler
  const connection = useSocketConnection(auth.authState, handleInvalidToken);

  // Get current user from members list
  const currentUser = useCurrentUser(auth.authState, connection.state.members);

  // Combined logout that clears auth and disconnects socket
  const logout = useCallback(() => {
    connection.disconnect();
    auth.clearAuth();
  }, [connection, auth]);

  // Combine errors from both sources
  const error = auth.error || connection.error;

  // Memoize the context value
  const value = useMemo<SocketContextValue>(
    () => ({
      state: connection.state,
      dispatch: connection.dispatch,
      isConnected: connection.isConnected,
      isAuthenticated: auth.isAuthenticated,
      currentUser,
      currentUserEmail: auth.authState.email || null,
      connectedMembers: connection.connectedMembers,
      error,
      login: auth.login,
      verifyCode: auth.verifyCode,
      logout,
      reconnect: connection.reconnect,
    }),
    [
      connection.state,
      connection.dispatch,
      connection.isConnected,
      connection.connectedMembers,
      connection.reconnect,
      auth.isAuthenticated,
      auth.authState.email,
      auth.login,
      auth.verifyCode,
      currentUser,
      error,
      logout,
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
