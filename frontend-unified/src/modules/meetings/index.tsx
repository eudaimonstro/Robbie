/**
 * Meetings Module
 *
 * This module wraps the Robbie real-time meeting functionality.
 * It includes its own SocketProvider for Socket.io connections.
 */

import { SocketProvider, useSocket } from './context/SocketContext';
import { AuthScreen } from './views/AuthScreen';
import { MeetingApp } from './views/MeetingApp';

function MeetingsContent() {
  const { isAuthenticated, isConnected } = useSocket();

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  // Show loading while connecting after auth
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="animate-spin w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Connecting to meeting...</p>
        </div>
      </div>
    );
  }

  // Show meeting app when authenticated and connected
  return <MeetingApp />;
}

export default function MeetingsModule() {
  return (
    <SocketProvider>
      <MeetingsContent />
    </SocketProvider>
  );
}

// Re-export for use in other parts of the app if needed
export { SocketProvider, useSocket } from './context/SocketContext';
