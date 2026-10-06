import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

let ioInstance: TypedServer | null = null;

export function setIoInstance(io: TypedServer): void {
  ioInstance = io;
}

export function getIoInstance(): TypedServer | null {
  return ioInstance;
}
