import { vi } from 'vitest';
import type { MeetingAction } from '@robbie-bylawyer/shared/types';
import type {
  ActionResponse,
  JoinMeetingResponse,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import { handleDispatchAction } from '../socket/actionHandler.js';
import { handleDisconnect } from '../socket/disconnectHandler.js';
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

/** What the server sent to a room (or to sockets by id), and the sockets it left out */
export interface Broadcast {
  room: string;
  event: string;
  payload: unknown;
  except?: string[];
}

/**
 * Signed-in sockets and a server for the socket handlers, run against the real database and
 * meeting storage without a network
 */
export function liveSockets() {
  const sockets: FakeSocket[] = [];
  const broadcasts: Broadcast[] = [];
  let next = 0;

  const toRoom = (room: string, except: string[] = []) => ({
    except: (ids: string | string[]) => toRoom(room, [...except, ...[ids].flat()]),
    emit: (event: string, payload: unknown) =>
      broadcasts.push({ room, event, payload, ...(except.length > 0 && { except }) }),
  });
  const io = {
    to: (room: string | string[]) => toRoom([room].flat().join(',')),
    in: (room: string) => ({
      fetchSockets: async () => sockets.filter((s) => s.rooms.has(room)),
    }),
    // The server's own sockets and rooms, as socket.io's in-memory adapter keeps them
    sockets: {
      adapter: {
        get rooms() {
          const rooms = new Map<string, Set<string>>();
          for (const socket of sockets) {
            for (const room of socket.rooms) {
              rooms.set(room, (rooms.get(room) ?? new Set()).add(socket.id));
            }
          }
          return rooms;
        },
      },
      get sockets() {
        return new Map(sockets.map((socket) => [socket.id, socket]));
      },
    },
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

  /** A socket's connection drops (a phone locks), starting its member's grace period */
  function drop(socket: FakeSocket): Promise<void> {
    return handleDisconnect(socket as never, io as never, 'disconnect');
  }

  /** Forget the sockets this made, so the next test starts with nobody connected */
  function disconnectAll(): void {
    for (const socket of sockets) {
      if (!socket.data.meetingCode) continue;
      roomManager.removeMember(socket.data.meetingCode, socket.id);
      roomManager.cancelGrace(socket.data.meetingCode, socket.data.userId);
    }
    sockets.length = 0;
    broadcasts.length = 0;
  }

  return { io, sockets, broadcasts, connect, join, dispatch, drop, disconnectAll };
}
