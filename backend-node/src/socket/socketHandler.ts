import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import { handleJoinMeeting } from './joinHandler.js';
import { handleDisconnect } from './disconnectHandler.js';
import { handleDispatchAction } from './actionHandler.js';
import { handleRequestState } from './stateRequestHandler.js';
import { socketAuth } from './socketAuth.js';

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Set up all socket event handlers for the meeting system.
 *
 * Event handlers are modularized into separate files:
 * - joinHandler.ts: JOIN_MEETING event
 * - disconnectHandler.ts: disconnect and LEAVE_MEETING events
 * - actionHandler.ts: DISPATCH_ACTION event
 * - stateRequestHandler.ts: REQUEST_STATE event
 */
export function setupSocketHandlers(io: TypedServer) {
  // Every connection must be signed in (see socketAuth)
  io.use(socketAuth());

  io.on('connection', (socket: TypedSocket) => {
    // Handle join meeting
    socket.on('JOIN_MEETING', (data, callback) => {
      handleJoinMeeting(socket, io, data, callback);
    });

    // Handle leave meeting
    socket.on('LEAVE_MEETING', () => {
      handleDisconnect(socket, io);
    });

    // Handle action dispatch
    socket.on('DISPATCH_ACTION', (data, callback) => {
      handleDispatchAction(socket, io, data, callback);
    });

    // Handle state request
    socket.on('REQUEST_STATE', (callback) => {
      handleRequestState(socket, callback);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      handleDisconnect(socket, io);
    });
  });
}
