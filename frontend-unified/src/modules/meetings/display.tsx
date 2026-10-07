import { Navigate, useParams } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import { MeetingOrganizationProvider } from './context/OrganizationBridge';
import { DisplayView } from './views/DisplayView';
import { MEETING_CODE, normalizeMeetingCode } from './utils/meetingLinks';

/**
 * /meetings/:code/display: the meeting on a TV or projector, joined as a display (it follows
 * the meeting without being a member of it)
 */
export default function MeetingDisplay() {
  const { code = '' } = useParams();
  const meetingCode = normalizeMeetingCode(code);
  if (!MEETING_CODE.test(meetingCode)) return <Navigate to="/meetings" replace />;
  return (
    <MeetingOrganizationProvider>
      <SocketProvider key={meetingCode} meetingCode={meetingCode} display>
        <DisplayView />
      </SocketProvider>
    </MeetingOrganizationProvider>
  );
}
