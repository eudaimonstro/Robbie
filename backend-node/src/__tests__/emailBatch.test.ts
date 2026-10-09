import { describe, it, expect, vi, beforeAll } from 'vitest';

// Resend, as the server talks to it in production: one request for a batch of emails
const batchSend = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: class {
    batch = { send: batchSend };
    emails = { send: vi.fn() };
  },
}));

let sendPlainEmails: typeof import('../auth/emailService.js').sendPlainEmails;
beforeAll(async () => {
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('EMAIL_OUTBOX_DIR', '');
  vi.resetModules();
  ({ sendPlainEmails } = await import('../auth/emailService.js'));
});

const emails = ['a@example.org', 'b@example.org', 'c@example.org'].map((to) => ({
  to,
  subject: 'Meeting notice',
  text: 'The meeting is on Tuesday.',
}));

describe('sendPlainEmails through Resend', () => {
  it('sends the batch in one request, in plain text, and says which were refused', async () => {
    batchSend.mockResolvedValueOnce({
      data: { data: [{ id: '1' }, { id: '3' }], errors: [{ index: 1, message: 'Invalid `to`' }] },
      error: null,
    });
    expect(await sendPlainEmails(emails, 'Meeting notice')).toEqual([true, false, true]);
    expect(batchSend).toHaveBeenCalledTimes(1);
    const [payload, options] = batchSend.mock.calls[0];
    expect(options).toEqual({ batchValidation: 'permissive' });
    expect(payload).toHaveLength(3);
    expect(payload[0]).toMatchObject({ to: 'a@example.org', text: 'The meeting is on Tuesday.' });
    expect(payload[0]).not.toHaveProperty('html');
  });

  it('counts the whole batch as not sent when Resend refuses the request', async () => {
    batchSend.mockResolvedValueOnce({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Too many requests' },
    });
    expect(await sendPlainEmails(emails, 'Meeting notice')).toEqual([false, false, false]);
  });
});
