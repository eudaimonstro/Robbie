import type { Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  StateResponse,
} from '@robbie-bylawyer/shared/types/socket';
import { getStorage } from '../db/meetingStorage.js';
import { logger } from '../middleware/logger.js';

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Handle REQUEST_STATE socket event
 */
export async function handleRequestState(
  socket: TypedSocket,
  callback: (response: StateResponse) => void,
): Promise<void> {
  try {
    if (!socket.data.meetingCode) {
      callback({ success: false, error: 'Not in a meeting' });
      return;
    }

    const storage = getStorage();
    const meeting = await storage.getMeeting(socket.data.meetingCode);
    if (!meeting) {
      callback({ success: false, error: 'Meeting not found' });
      return;
    }

    callback({
      success: true,
      state: meeting.state,
      stateVersion: meeting.stateVersion,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching state');
    callback({ success: false, error: 'Failed to fetch state' });
  }
}
