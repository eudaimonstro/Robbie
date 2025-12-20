import { Wifi, WifiOff, RefreshCw, LogOut, Users } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export function ConnectionStatus() {
  const { isConnected, connectedMembers, currentUser, logout, reconnect, error } = useSocket();

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2">
      <div className="flex items-center justify-between max-w-lg mx-auto">
        <div className="flex items-center gap-3">
          {/* Connection indicator */}
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi size={16} className="text-green-500" />
                <span className="text-sm text-green-600 font-medium">Connected</span>
              </>
            ) : (
              <>
                <WifiOff size={16} className="text-red-500" />
                <span className="text-sm text-red-600 font-medium">Disconnected</span>
                <button
                  onClick={reconnect}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Reconnect"
                >
                  <RefreshCw size={14} className="text-gray-500" />
                </button>
              </>
            )}
          </div>

          {/* Connected members count */}
          {isConnected && (
            <div className="flex items-center gap-1 text-sm text-gray-500 border-l border-gray-200 pl-3">
              <Users size={14} />
              <span>{connectedMembers.length} online</span>
            </div>
          )}
        </div>

        {/* Current user & logout */}
        <div className="flex items-center gap-2">
          {currentUser && (
            <span className="text-sm text-gray-600">
              {currentUser.name}
            </span>
          )}
          <button
            onClick={logout}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
            title="Leave meeting"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mt-2 text-sm max-w-lg mx-auto">
          {error}
        </div>
      )}
    </div>
  );
}
