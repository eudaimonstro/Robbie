/**
 * Meetings Module
 *
 * /meetings is the Live Meetings page: the organization's schedule and the code box.
 * /meetings/:code is the live meeting with that code. The link is the meeting, so it can be
 * shared or shown as a QR code, and a reload rejoins it; each meeting gets its own socket.
 * (/meetings/:code/display, the TV, is its own route in App.tsx, outside the app's layout.)
 */

import { useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { SocketProvider, useSocket } from './context/SocketContext';
import { MeetingOrganizationProvider } from './context/OrganizationBridge';
import { LiveMeetingsPage } from './views/LiveMeetingsPage';
import { MeetingApp } from './views/MeetingApp';
import { JoinMeetingScreen } from './views/JoinMeetingScreen';
import { MEETING_CODE, normalizeMeetingCode } from './utils/meetingLinks';
import { useToast } from '../../context/ToastContext';

function MeetingsContent() {
  const { isConnected, error, joinError, reconnect, leaveMeeting, meetingCode } = useSocket();
  const { showToast } = useToast();
  // A link to a meeting that isn't scheduled (or a code typed wrong): the code box says so
  const notFound = joinError?.code === 'MEETING_NOT_FOUND';

  // Forward socket errors to toast notifications
  useEffect(() => {
    if (error && !notFound) {
      showToast('error', error);
    }
  }, [error, notFound, showToast]);

  if (!isConnected && joinError?.code === 'MEETING_NOT_FOUND') {
    return (
      <div className="max-w-md mx-auto py-12">
        <JoinMeetingScreen message={joinError.message} initialCode={meetingCode} />
      </div>
    );
  }

  // Show loading while connecting to the meeting. The meeting view (with its Reconnect and Leave
  // buttons) isn't shown until connected, so this screen needs its own way out: the socket
  // stops retrying after a few attempts, and a failed join doesn't retry at all.
  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-8 text-center max-w-md">
          {error ? (
            <p className="text-gavel mb-4" role="alert">
              {error}
            </p>
          ) : (
            <>
              <div className="animate-spin w-12 h-12 border-4 border-gavel border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-ink-muted mb-4">Connecting to meeting...</p>
            </>
          )}
          <div className="flex justify-center gap-3">
            {error && (
              <button onClick={reconnect} className="btn-primary btn-sm">
                Try again
              </button>
            )}
            <button onClick={leaveMeeting} className="btn-secondary btn-sm">
              Leave meeting
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show the meeting once connected
  return <MeetingApp />;
}

/** The meeting in the link; a link that can't be a meeting code goes to the Live Meetings page */
function LiveMeetingRoute() {
  const { code = '' } = useParams();
  const meetingCode = normalizeMeetingCode(code);
  if (!MEETING_CODE.test(meetingCode)) return <Navigate to="/meetings" replace />;
  // A new code is a new meeting: a fresh provider, so nothing of the last one shows
  return (
    <SocketProvider key={meetingCode} meetingCode={meetingCode}>
      <MeetingsContent />
    </SocketProvider>
  );
}

export default function MeetingsModule() {
  return (
    <MeetingOrganizationProvider>
      <Routes>
        <Route index element={<LiveMeetingsPage />} />
        <Route path=":code" element={<LiveMeetingRoute />} />
        <Route path="*" element={<Navigate to="/meetings" replace />} />
      </Routes>
    </MeetingOrganizationProvider>
  );
}

// Re-export for use in other parts of the app if needed
export { SocketProvider, useSocket } from './context/SocketContext';
export { MeetingOrganizationProvider, useMeetingOrganization } from './context/OrganizationBridge';
