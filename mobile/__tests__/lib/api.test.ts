import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import { acceptTerms, getMe, requestCode, signOut, updateName, verifyCode } from '../../lib/api';

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

  it('treats a 401 from renaming as signed out', async () => {
    globalThis.fetch = jest.fn(
      async () => new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 }),
    ) as jest.Mock;
    expect(await updateName('expired', 'Ann')).toBeNull();
  });

  it('exports requestCode, updateName and signOut', () => {
    expect([requestCode, updateName, signOut].every((f) => typeof f === 'function')).toBe(true);
  });
});

describe('terms calls', () => {
  it('reads whether the user accepted the current terms', async () => {
    const user = { id: 1, email: 'a@b.c', name: 'A' };
    globalThis.fetch = jest.fn(
      async () => new Response(JSON.stringify({ user, termsAccepted: false })),
    ) as jest.Mock;
    expect(await getMe('tok')).toEqual({ user, termsAccepted: false });
  });

  it('accepts the terms version this app shows', async () => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ termsAccepted: true })));
    globalThis.fetch = fetchMock as jest.Mock;
    expect(await acceptTerms('tok')).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/auth\/accept-terms$/);
    expect(JSON.parse(init.body as string)).toEqual({ version: TERMS_VERSION });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it("shows the server's message when the terms changed", async () => {
    respond(
      409,
      JSON.stringify({ error: 'The terms have changed. Reload to see the current terms.' }),
    );
    await expect(acceptTerms('tok')).rejects.toThrow('The terms have changed');
  });

  it('reports a token that no longer works', async () => {
    respond(401, JSON.stringify({ error: 'Not signed in' }));
    expect(await acceptTerms('old')).toBe(false);
  });
});
