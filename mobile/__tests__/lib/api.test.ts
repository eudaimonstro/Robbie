import { getMe, requestCode, signOut, updateName, verifyCode } from '../../lib/api';

function respond(status: number, body: string) {
  globalThis.fetch = jest.fn(async () => new Response(body, { status })) as jest.Mock;
}

describe('auth API errors', () => {
  it("shows the server's message", async () => {
    respond(429, JSON.stringify({ error: 'Too many requests. Try again in a minute.' }));
    await expect(requestCode('a@b.c')).rejects.toThrow('Too many requests. Try again in a minute.');
  });

  it('falls back to a general message when the body is not JSON', async () => {
    respond(502, '<html>Bad Gateway</html>');
    await expect(verifyCode('a@b.c', '123456')).rejects.toThrow('Verification failed');
  });
});

describe('sign-in calls', () => {
  it('verifies as the mobile client and returns the token', async () => {
    const fetchMock = jest.fn(
      async () =>
        new Response(JSON.stringify({ user: { id: 1, email: 'a@b.c', name: null }, token: 't' })),
    );
    globalThis.fetch = fetchMock as jest.Mock;
    const result = await verifyCode('a@b.c', '123456');
    expect(result).toEqual({ user: { id: 1, email: 'a@b.c', name: null }, token: 't' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'a@b.c',
      code: '123456',
      client: 'mobile',
    });
  });

  it('sends the token as a bearer header', async () => {
    const fetchMock = jest.fn(
      async () => new Response(JSON.stringify({ user: { id: 1, email: 'a@b.c', name: 'A' } })),
    );
    globalThis.fetch = fetchMock as jest.Mock;
    await getMe('tok');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('treats a 401 from me as signed out', async () => {
    globalThis.fetch = jest.fn(
      async () => new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 }),
    ) as jest.Mock;
    expect(await getMe('expired')).toBeNull();
  });

  it('exports requestCode, updateName and signOut', () => {
    expect([requestCode, updateName, signOut].every((f) => typeof f === 'function')).toBe(true);
  });
});
