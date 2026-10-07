import { useSocket } from '../context/SocketContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ChairConsole } from './ChairConsole';
import { ParticipantView } from './ParticipantView';

/**
 * The screen for the user's role in the meeting, as the server derived it: the console for the
 * chair and admins, the participant's screen for members and guests
 */
export function MeetingApp() {
  const { state, dispatch, currentUser, myRole } = useSocket();
  const presides = myRole === 'chair' || myRole === 'admin';
  return (
    <ErrorBoundary>
      {presides ? (
        <ChairConsole />
      ) : (
        currentUser && (
          <ParticipantView state={state} dispatch={dispatch} currentUser={currentUser} />
        )
      )}
    </ErrorBoundary>
  );
}
