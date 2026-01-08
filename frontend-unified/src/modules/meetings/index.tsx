/**
 * Meetings Module
 *
 * This module wraps the Robbie real-time meeting functionality.
 * It includes its own SocketProvider for Socket.io connections.
 */

import { useEffect } from 'react';
import { SocketProvider, useSocket } from './context/SocketContext';
import { MeetingOrganizationProvider } from './context/OrganizationBridge';
import { AuthScreen } from './views/AuthScreen';
import { MeetingApp } from './views/MeetingApp';
import { useToast } from '../../context/ToastContext';

function MeetingsContent() {
  const { isAuthenticated, isConnected, error } = useSocket();
  const { showToast } = useToast();

  // Forward socket errors to toast notifications
  useEffect(() => {
    if (error) {
      showToast('error', error);
    }
  }, [error, showToast]);

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  // Show loading while connecting after auth
  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-8 text-center">
          <div className="animate-spin w-12 h-12 border-4 border-meeting-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-secondary-600 dark:text-secondary-400">Connecting to meeting...</p>
        </div>
      </div>
    );
  }

  // Show meeting app when authenticated and connected
  return <MeetingApp />;
}

export default function MeetingsModule() {
  return (
    <MeetingOrganizationProvider>
      <SocketProvider>
        <MeetingsContent />
      </SocketProvider>
    </MeetingOrganizationProvider>
  );
}

// Re-export for use in other parts of the app if needed
export { SocketProvider, useSocket } from './context/SocketContext';
export { MeetingOrganizationProvider, useMeetingOrganization } from './context/OrganizationBridge';
