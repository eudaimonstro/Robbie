import { vi } from 'vitest';
import type { MeetingAction } from '@robbie-bylawyer/shared/types';
import type {
  ActionResponse,
  JoinMeetingResponse,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import { handleDispatchAction } from '../socket/actionHandler.js';
import { handleJoinMeeting } from '../socket/joinHandler.js';
import { actionRateLimiter, joinRateLimiter } from '../socket/rateLimiter.js';
import { roomManager } from '../socket/roomManager.js';

/** A stand-in for a connected socket.io socket, as the socket handlers use one */
export interface FakeSocket {
  id: string;
  data: SocketData;
  rooms: Set<string>;
  join(room: string): void;
  leave(room: string): void;
  to(room: string): { emit: (event: string, payload: unknown) => void };
  emit: (event: string, payload: unknown) => void;
}

/** What the server sent to a room */
export interface Broadcast {
  room: string;
  event: string;
  payload: unknown;
}

/**
 * Signed-in sockets and a server for the socket handlers, run against the real database and
 * meeting storage without a network
 */
export function liveSockets() {
  const sockets: FakeSocket[] = [];
  const broadcasts: Broadcast[] = [];
  let next = 0;

  const toRoom = (room: string) => ({
    emit: (event: string, payload: unknown) => broadcasts.push({ room, event, payload }),
  });
  const io = {
    to: toRoom,
    in: (room: string) => ({
      fetchSockets: async () => sockets.filter((s) => s.rooms.has(room)),
    }),
  };

  /** A socket signed in as this user (see socketAuth) */
  function connect(user: { id: number; email: string }): FakeSocket {
    const socket: FakeSocket = {
      id: `socket-${++next}`,
      data: {
        userId: user.id,
        email: user.email,
        name: '',
        sessionId: `session-${next}`,
        meetingCode: null,
        role: 'guest',
      },
      rooms: new Set(),
      join(room) {
        this.rooms.add(room);
      },
      leave(room) {
        this.rooms.delete(room);
      },
      to: toRoom,
      emit: vi.fn(),
    };
    sockets.push(socket);
    return socket;
  }

  async function join(
    socket: FakeSocket,
    meetingCode: string,
    display?: boolean,
  ): Promise<JoinMeetingResponse> {
    joinRateLimiter.remove(socket.data.userId);
    const callback = vi.fn();
    await handleJoinMeeting(socket as never, io as never, { meetingCode, display }, callback);
    return callback.mock.calls[0][0];
  }

  async function dispatch(socket: FakeSocket, action: object): Promise<ActionResponse> {
    actionRateLimiter.remove(socket.data.userId);
    const callback = vi.fn();
    await handleDispatchAction(
      socket as never,
      io as never,
      { action: action as MeetingAction, clientSequence: 1 },
      callback,
    );
    return callback.mock.calls[0][0];
  }

  /** Forget the sockets this made, so the next test starts with nobody connected */
  function disconnectAll(): void {
    for (const socket of sockets) {
      if (socket.data.meetingCode) roomManager.removeMember(socket.data.meetingCode, socket.id);
    }
    sockets.length = 0;
    broadcasts.length = 0;
  }

  return { io, sockets, broadcasts, connect, join, dispatch, disconnectAll };
}
