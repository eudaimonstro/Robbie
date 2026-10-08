import type { SocketData } from '@robbie-bylawyer/shared/types/socket';
import { getStorage } from '../db/meetingStorage.js';
import { logger } from '../middleware/logger.js';
import { getIoInstance } from './ioInstance.js';
import { roomManager } from './roomManager.js';

/** What the people in a meeting are told when it is canceled */
export const MEETING_CANCELED = 'This meeting was canceled.';
/** The ERROR code that tells a client its meeting was canceled (and not to rejoin) */
export const MEETING_CANCELED_CODE = 'MEETING_CANCELED';

/**
 * Close the live meeting of a scheduled meeting just canceled (its packet deleted): the people
 * in it are told, taken out of its room (still signed in), and its live state is deleted, so
 * nothing is left to call to order without a packet. Nothing happens for a meeting nobody has
 * opened. Best effort, like the bylaw sync: the meeting is canceled either way, and a live
 * state left behind can't be joined (a join needs the packet).
 */
export async function closeCanceledMeeting(meetingCode: string): Promise<void> {
  const room = `meeting:${meetingCode}`;
  try {
    const io = getIoInstance();
    const sockets = io ? await io.in(room).fetchSockets() : [];
    if (io && sockets.length > 0) {
      io.to(room).emit('ERROR', { message: MEETING_CANCELED, code: MEETING_CANCELED_CODE });
      for (const socket of sockets) {
        socket.leave(room);
        socket.data.meetingCode = null;
        socket.data.role = null as unknown as SocketData['role'];
        socket.data.display = false;
      }
    }
    roomManager.forgetMeeting(meetingCode);
    await getStorage().deleteMeeting(meetingCode);
  } catch (error) {
    logger.error({ err: error, meetingCode }, 'Failed to close the canceled meeting');
  }
}
