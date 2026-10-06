import { requestVerification, verifyCode } from '../../lib/api';

function respond(status: number, body: string) {
  globalThis.fetch = jest.fn(async () => new Response(body, { status })) as jest.Mock;
}

describe('auth API errors', () => {
  it("shows the server's message", async () => {
    respond(429, JSON.stringify({ error: 'Too many requests. Try again in a minute.' }));
    await expect(requestVerification('a@b.c', 'Al', 'DEMO')).rejects.toThrow(
      'Too many requests. Try again in a minute.',
    );
  });

  it('falls back to a general message when the body is not JSON', async () => {
    respond(502, '<html>Bad Gateway</html>');
    await expect(verifyCode('a@b.c', '123456', 'DEMO')).rejects.toThrow('Verification failed');
  });
});
