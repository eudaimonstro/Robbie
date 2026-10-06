import type {
  DispatchActionPayload,
  JoinMeetingPayload,
} from '@robbie-bylawyer/shared/types/socket';
import { logger } from '../middleware/logger.js';

/*
 * Socket.io ignores what event listeners return, so a handler's rejected promise is unhandled
 * and stops the server. Clients can send any payload, or no callback at all. These helpers keep
 * both from reaching Node.
 */

type Ack<R> = (response: R) => void;

/** The client's acknowledgement callback, or a no-op when it didn't send one */
export function safeAck<R>(callback: unknown): Ack<R> {
  return typeof callback === 'function' ? (callback as Ack<R>) : () => {};
}

/** Log a handler's failure instead of leaving its rejection unhandled */
export function runEvent(event: string, handling: Promise<unknown>): void {
  handling.catch((err) => logger.error({ err, event }, 'Socket event handler failed'));
}

/**
 * A listener for an event with a payload and a callback: an invalid payload is answered with
 * "Invalid request", and the handler gets a callback that is always safe to call
 */
export function guardedEvent<P, R extends { success: boolean; error?: string }>(
  event: string,
  isValid: (data: unknown) => data is P,
  handle: (data: P, ack: Ack<R>) => Promise<void>,
): (data: unknown, callback?: unknown) => void {
  return (data, callback) => {
    const ack = safeAck<R>(callback);
    if (!isValid(data)) {
      ack({ success: false, error: 'Invalid request' } as R);
      return;
    }
    runEvent(event, handle(data, ack));
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isJoinPayload(data: unknown): data is JoinMeetingPayload {
  return isObject(data) && typeof data.meetingCode === 'string';
}

export function isDispatchPayload(data: unknown): data is DispatchActionPayload {
  return isObject(data) && isObject(data.action) && typeof data.action.type === 'string';
}
