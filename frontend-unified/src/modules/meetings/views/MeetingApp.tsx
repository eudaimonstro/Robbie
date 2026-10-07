import { useSocket } from '../context/SocketContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ChairConsole } from './ChairConsole';
import { PhoneView } from './PhoneView';

/**
 * The screen for the user's role in the meeting, as the server derived it: the console for the
 * chair and admins, the phone view for members and guests
 */
export function MeetingApp() {
  const { myRole } = useSocket();
  const presides = myRole === 'chair' || myRole === 'admin';
  return <ErrorBoundary>{presides ? <ChairConsole /> : <PhoneView />}</ErrorBoundary>;
}
