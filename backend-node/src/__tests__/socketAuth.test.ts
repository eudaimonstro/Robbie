import { describe, it, expect, vi } from 'vitest';
import { socketAuth } from '../socket/socketAuth.js';

const session = {
  sessionId: 's-1',
  user: { id: 7, email: 'ann@example.org', name: 'Ann' },
};

function fakeSocket(handshake: { auth?: Record<string, unknown>; cookie?: string }) {
  return {
    handshake: { auth: handshake.auth ?? {}, headers: { cookie: handshake.cookie } },
    data: {} as Record<string, unknown>,
  };
}

async function run(
  socket: ReturnType<typeof fakeSocket>,
  find: Parameters<typeof socketAuth>[0] = vi.fn(async () => session),
) {
  const next = vi.fn();
  await socketAuth(find)(socket as never, next);
  return { next, find };
}

describe('socketAuth', () => {
  it('accepts the web session cookie', async () => {
    const socket = fakeSocket({ cookie: 'theme=dark; session=abc123' });
    const { next, find } = await run(socket);
    expect(find).toHaveBeenCalledWith('abc123');
    expect(next).toHaveBeenCalledWith();
    expect(socket.data).toMatchObject({
      userId: 7,
      email: 'ann@example.org',
      name: 'Ann',
      sessionId: 's-1',
      meetingCode: null,
    });
  });

  it('accepts a mobile token from the handshake', async () => {
    const { find, next } = await run(fakeSocket({ auth: { token: 'tok' } }));
    expect(find).toHaveBeenCalledWith('tok');
    expect(next).toHaveBeenCalledWith();
  });

  it('refuses a connection with no session or an unknown one', async () => {
    expect((await run(fakeSocket({}))).next).toHaveBeenCalledWith(expect.any(Error));
    const unknown = await run(
      fakeSocket({ cookie: 'session=zzz' }),
      vi.fn(async () => null),
    );
    expect(unknown.next).toHaveBeenCalledWith(expect.any(Error));
  });
});
