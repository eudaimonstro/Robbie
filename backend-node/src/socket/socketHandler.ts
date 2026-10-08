import type { Server, Socket } from 'socket.io';
import type {
  ActionResponse,
  ClientToServerEvents,
  JoinMeetingResponse,
  ServerToClientEvents,
  SocketData,
  StateResponse,
} from '@robbie-bylawyer/shared/types/socket';
import { handleJoinMeeting } from './joinHandler.js';
import { handleDisconnect } from './disconnectHandler.js';
import { handleDispatchAction } from './actionHandler.js';
import { handleRequestState } from './stateRequestHandler.js';
import { socketAuth } from './socketAuth.js';
import {
  guardedEvent,
  isDispatchPayload,
  isJoinPayload,
  runEvent,
  safeAck,
} from './socketEvents.js';

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

  // Every listener goes through socketEvents: a bad payload, a missing callback or a failed
  // handler must never become an unhandled rejection, which would stop the server
  // A connection back after a moment without signal is a new connection: it signs in again
  // (socketAuth) and joins again, which changes nothing for a member still present and answers
  // with the current state (index.ts: no connection state recovery)
  io.on('connection', (socket: TypedSocket) => {
    socket.on(
      'JOIN_MEETING',
      guardedEvent('JOIN_MEETING', isJoinPayload, (data, ack: (r: JoinMeetingResponse) => void) =>
        handleJoinMeeting(socket, io, data, ack),
      ),
    );

    socket.on('LEAVE_MEETING', () => {
      runEvent('LEAVE_MEETING', handleDisconnect(socket, io, 'leave'));
    });

    socket.on(
      'DISPATCH_ACTION',
      guardedEvent('DISPATCH_ACTION', isDispatchPayload, (data, ack: (r: ActionResponse) => void) =>
        handleDispatchAction(socket, io, data, ack),
      ),
    );

    socket.on('REQUEST_STATE', (callback: unknown) => {
      runEvent('REQUEST_STATE', handleRequestState(socket, safeAck<StateResponse>(callback)));
    });

    socket.on('disconnect', () => {
      runEvent('disconnect', handleDisconnect(socket, io, 'disconnect'));
    });
  });
}
