import { describe, it, expect, vi, beforeEach } from 'vitest';

const io = vi.hoisted(() => ({
  current: null as null | { fetchSockets: () => Promise<unknown[]> },
}));
vi.mock('../socket/ioInstance.js', () => ({ getIoInstance: () => io.current }));
vi.mock('../auth/sessionService.js', () => ({ liveSessionIds: vi.fn() }));

import { disconnectSocketsWithoutSession } from '../socket/sessionSockets.js';

function fakeSocket(sessionId: string) {
  return { data: { sessionId }, disconnect: vi.fn() };
}

describe('disconnectSocketsWithoutSession', () => {
  beforeEach(() => {
    io.current = null;
  });

  it('closes the sockets whose session ended, and keeps the rest', async () => {
    const live = fakeSocket('s-live');
    const liveToo = fakeSocket('s-live');
    const ended = fakeSocket('s-ended');
    io.current = { fetchSockets: async () => [live, liveToo, ended] };
    const findLive = vi.fn(async () => new Set(['s-live']));

    expect(await disconnectSocketsWithoutSession(findLive)).toBe(1);
    // Each session is looked up once
    expect(findLive).toHaveBeenCalledWith(['s-live', 's-ended']);
    expect(ended.disconnect).toHaveBeenCalledWith(true);
    expect(live.disconnect).not.toHaveBeenCalled();
    expect(liveToo.disconnect).not.toHaveBeenCalled();
  });

  it('does nothing without a server or sockets', async () => {
    const findLive = vi.fn(async () => new Set<string>());
    expect(await disconnectSocketsWithoutSession(findLive)).toBe(0);
    io.current = { fetchSockets: async () => [] };
    expect(await disconnectSocketsWithoutSession(findLive)).toBe(0);
    expect(findLive).not.toHaveBeenCalled();
  });
});
