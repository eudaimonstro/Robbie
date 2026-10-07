import { Wifi, WifiOff, RefreshCw, LogOut, Users } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export function ConnectionStatus() {
  const { isConnected, connectedMembers, currentUser, leaveMeeting, reconnect, error } =
    useSocket();

  return (
    <div className="flex items-center gap-4">
      {/* Connection indicator */}
      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-carried-tint">
              <Wifi size={14} className="text-carried" />
              <span className="text-xs text-carried font-medium">Connected</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-caution-tint">
              <WifiOff size={14} className="text-caution-ink" />
              <span className="text-xs text-caution-ink font-medium">Disconnected</span>
            </div>
            <button
              onClick={reconnect}
              className="p-1.5 hover:bg-surface-2 rounded-lg transition-colors"
              title="Reconnect"
            >
              <RefreshCw size={14} className="text-ink-muted" />
            </button>
          </>
        )}
      </div>

      {/* Connected members count */}
      {isConnected && (
        <div className="flex items-center gap-1.5 text-sm text-ink-muted">
          <Users size={14} />
          <span>{connectedMembers.length}</span>
        </div>
      )}

      {/* Current user & leave meeting */}
      <div className="flex items-center gap-2">
        {currentUser && (
          <span className="text-sm text-ink-muted hidden sm:inline">{currentUser.name}</span>
        )}
        <button
          onClick={leaveMeeting}
          className="p-1.5 hover:bg-surface-2 rounded-lg text-ink-muted hover:text-gavel transition-colors"
          title="Leave meeting"
        >
          <LogOut size={16} />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="absolute top-full left-0 right-0 bg-gavel-tint border border-gavel/30 text-ink px-3 py-2 rounded-lg mt-2 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
