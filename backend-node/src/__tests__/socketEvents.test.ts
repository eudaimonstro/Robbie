import { describe, it, expect, vi, beforeEach } from 'vitest';

const logger = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }));
vi.mock('../middleware/logger.js', () => ({ logger }));

const { guardedEvent, isDispatchPayload, isJoinPayload, runEvent, safeAck } =
  await import('../socket/socketEvents.js');

type Response = { success: boolean; error?: string };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const anyPayload = (_data: unknown): _data is unknown => true;

describe('safeAck', () => {
  it("is a no-op when the client didn't send a callback", () => {
    for (const callback of [undefined, null, 'x', 42, {}]) {
      expect(() => safeAck<Response>(callback)({ success: true })).not.toThrow();
    }
  });

  it("calls the client's callback", () => {
    const callback = vi.fn();
    safeAck<Response>(callback)({ success: true });
    expect(callback).toHaveBeenCalledWith({ success: true });
  });
});

describe('runEvent', () => {
  beforeEach(() => logger.error.mockClear());

  it('logs a failed handler instead of leaving the rejection unhandled', async () => {
    runEvent('LEAVE_MEETING', Promise.reject(new Error('boom')));
    await flush();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'LEAVE_MEETING' }),
      expect.any(String),
    );
  });
});

describe('guardedEvent', () => {
  beforeEach(() => logger.error.mockClear());

  it('answers an invalid payload without calling the handler', () => {
    const handle = vi.fn(async () => {});
    const ack = vi.fn();
    guardedEvent<{ meetingCode: string }, Response>(
      'JOIN_MEETING',
      isJoinPayload,
      handle,
    )(null, ack);
    expect(ack).toHaveBeenCalledWith({ success: false, error: 'Invalid request' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('survives an invalid payload with no callback', () => {
    const listener = guardedEvent<{ meetingCode: string }, Response>(
      'JOIN_MEETING',
      isJoinPayload,
      vi.fn(async () => {}),
    );
    expect(() => listener(null)).not.toThrow();
  });

  it('passes a valid payload and the callback to the handler', async () => {
    const ack = vi.fn();
    const handle = vi.fn(async (_data: { meetingCode: string }, reply: (r: Response) => void) => {
      reply({ success: true });
    });
    guardedEvent('JOIN_MEETING', isJoinPayload, handle)({ meetingCode: 'ABCD' }, ack);
    await flush();
    expect(handle).toHaveBeenCalledWith({ meetingCode: 'ABCD' }, expect.any(Function));
    expect(ack).toHaveBeenCalledWith({ success: true });
  });

  it('lets a handler answer a client that sent no callback', async () => {
    const handle = vi.fn(async (_data: unknown, reply: (r: Response) => void) => {
      reply({ success: false, error: 'failed' });
    });
    guardedEvent('JOIN_MEETING', anyPayload, handle)({ meetingCode: 'ABCD' });
    await flush();
    expect(handle).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs a handler that fails', async () => {
    const handle = vi.fn(async () => {
      throw new Error('boom');
    });
    guardedEvent('DISPATCH_ACTION', anyPayload, handle)({}, vi.fn());
    await flush();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'DISPATCH_ACTION' }),
      expect.any(String),
    );
  });
});

describe('payload checks', () => {
  it('needs a string meeting code to join', () => {
    expect(isJoinPayload({ meetingCode: 'ABCD' })).toBe(true);
    for (const data of [null, undefined, 'ABCD', [], {}, { meetingCode: 42 }]) {
      expect(isJoinPayload(data)).toBe(false);
    }
  });

  it('needs an action object with a string type to dispatch', () => {
    expect(isDispatchPayload({ action: { type: 'CALL_TO_ORDER' }, clientSequence: 1 })).toBe(true);
    for (const data of [
      null,
      'x',
      {},
      { action: null },
      { action: 'CALL_TO_ORDER' },
      { action: {} },
      { action: { type: 3 } },
    ]) {
      expect(isDispatchPayload(data)).toBe(false);
    }
  });
});
