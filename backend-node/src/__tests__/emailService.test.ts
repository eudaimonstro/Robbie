import { describe, it, expect, afterEach } from 'vitest';
import {
  addedToOrganizationEmail,
  captureEmailsForTests,
  captureMemberEmailsForTests,
  sendAddedToOrganization,
  sendSignInCode,
} from '../auth/emailService.js';

describe('sendSignInCode', () => {
  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  // Before any capture: in production the provider check comes first anyway
  it('refuses to pretend to send in production without an email provider', async () => {
    process.env.NODE_ENV = 'production';
    await expect(sendSignInCode('ann@example.org', '042137')).rejects.toThrow(/provider/);
  });

  it('delivers to the test outbox when capturing', async () => {
    const outbox = captureEmailsForTests();
    await sendSignInCode('ann@example.org', '042137');
    expect(outbox).toEqual([{ to: 'ann@example.org', code: '042137' }]);
  });

  it('still refuses in production while capturing', async () => {
    captureEmailsForTests();
    process.env.NODE_ENV = 'production';
    await expect(sendSignInCode('ann@example.org', '042137')).rejects.toThrow(/provider/);
  });
});

describe('captureEmailsForTests', () => {
  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('works only under test', () => {
    process.env.NODE_ENV = 'development';
    expect(() => captureEmailsForTests()).toThrow();
    process.env.NODE_ENV = 'production';
    expect(() => captureEmailsForTests()).toThrow();
  });
});

describe('sendAddedToOrganization', () => {
  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('delivers to the test outbox when capturing', async () => {
    const outbox = captureMemberEmailsForTests();
    await sendAddedToOrganization({ to: 'bo@example.org', organization: 'Org A', addedBy: 'Ann' });
    expect(outbox).toEqual([{ to: 'bo@example.org', organization: 'Org A', addedBy: 'Ann' }]);
  });

  it('refuses to pretend to send in production without an email provider', async () => {
    captureMemberEmailsForTests();
    process.env.NODE_ENV = 'production';
    await expect(
      sendAddedToOrganization({ to: 'bo@example.org', organization: 'Org A', addedBy: 'Ann' }),
    ).rejects.toThrow(/provider/);
  });
});

describe('addedToOrganizationEmail', () => {
  it('says who added them, to what, and links to the app', () => {
    const email = addedToOrganizationEmail(
      { to: 'bo@example.org', organization: 'Org A', addedBy: 'Ann' },
      'https://robbie.example',
    );
    expect(email.subject).toBe('You were added to Org A on Robbie');
    expect(email.text).toContain('Ann added you to Org A on Robbie.');
    expect(email.text).toContain('https://robbie.example');
    expect(email.html).toContain('href="https://robbie.example"');
  });

  it('escapes names in the HTML and keeps the subject to one line', () => {
    const email = addedToOrganizationEmail(
      { to: 'bo@example.org', organization: 'A & B\nClub', addedBy: '<script>x</script>' },
      'https://robbie.example',
    );
    expect(email.subject).toBe('You were added to A & B Club on Robbie');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(email.html).toContain('A &amp; B Club');
  });
});
