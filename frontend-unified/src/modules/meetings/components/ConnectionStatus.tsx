import { Wifi, WifiOff, RefreshCw, LogOut, Users } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export function ConnectionStatus() {
  const { isConnected, connectedMembers, currentUser, logout, reconnect, error } = useSocket();

  return (
    <div className="flex items-center gap-4">
      {/* Connection indicator */}
      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-success-100 dark:bg-success-900/30">
              <Wifi size={14} className="text-success-600 dark:text-success-400" />
              <span className="text-xs text-success-700 dark:text-success-400 font-medium">
                Connected
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-danger-100 dark:bg-danger-900/30">
              <WifiOff size={14} className="text-danger-600 dark:text-danger-400" />
              <span className="text-xs text-danger-700 dark:text-danger-400 font-medium">
                Disconnected
              </span>
            </div>
            <button
              onClick={reconnect}
              className="p-1.5 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-lg transition-colors"
              title="Reconnect"
            >
              <RefreshCw size={14} className="text-secondary-500 dark:text-secondary-400" />
            </button>
          </>
        )}
      </div>

      {/* Connected members count */}
      {isConnected && (
        <div className="flex items-center gap-1.5 text-sm text-secondary-500 dark:text-secondary-400">
          <Users size={14} />
          <span>{connectedMembers.length}</span>
        </div>
      )}

      {/* Current user & logout */}
      <div className="flex items-center gap-2">
        {currentUser && (
          <span className="text-sm text-secondary-600 dark:text-secondary-400 hidden sm:inline">
            {currentUser.name}
          </span>
        )}
        <button
          onClick={logout}
          className="p-1.5 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded-lg text-secondary-500 dark:text-secondary-400 hover:text-danger-600 dark:hover:text-danger-400 transition-colors"
          title="Leave meeting"
        >
          <LogOut size={16} />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="absolute top-full left-0 right-0 bg-danger-50 dark:bg-danger-900/30 border border-danger-200 dark:border-danger-800 text-danger-700 dark:text-danger-400 px-3 py-2 rounded-lg mt-2 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
