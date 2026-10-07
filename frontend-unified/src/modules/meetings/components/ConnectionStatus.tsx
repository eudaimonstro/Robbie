import { Wifi, WifiOff, RefreshCw, LogOut } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export function ConnectionStatus() {
  const { isConnected, leaveMeeting, reconnect, error } = useSocket();

  return (
    <div className="flex items-center gap-2">
      {/* Connection indicator */}
      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            {/* Quiet while all is well: the word shows only when the connection is lost */}
            <div className="flex items-center rounded-full bg-carried-tint p-1.5" title="Connected">
              <Wifi size={14} className="text-carried" aria-hidden="true" />
              <span className="sr-only">Connected</span>
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

      {/* Current user & leave meeting */}
      <div className="flex items-center gap-2">
        {/* The way back to the app: a live meeting hides the sidebar */}
        <button
          type="button"
          onClick={leaveMeeting}
          className="btn-ghost btn-sm"
          aria-label="Leave meeting"
          title="Leave the meeting and return to the app"
        >
          <LogOut size={16} aria-hidden="true" />
          Leave
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
