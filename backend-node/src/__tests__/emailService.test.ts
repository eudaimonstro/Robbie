import { describe, it, expect, afterEach } from 'vitest';
import {
  MAX_QUOTED_NAME,
  addedToOrganizationEmail,
  quotedName,
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
    await sendAddedToOrganization({
      to: 'bo@example.org',
      organization: 'Org A',
      addedBy: 'Ann',
      addedByEmail: 'ann@example.org',
    });
    expect(outbox).toEqual([
      {
        to: 'bo@example.org',
        organization: 'Org A',
        addedBy: 'Ann',
        addedByEmail: 'ann@example.org',
      },
    ]);
  });

  it('refuses to pretend to send in production without an email provider', async () => {
    captureMemberEmailsForTests();
    process.env.NODE_ENV = 'production';
    await expect(
      sendAddedToOrganization({
        to: 'bo@example.org',
        organization: 'Org A',
        addedBy: 'Ann',
        addedByEmail: 'ann@example.org',
      }),
    ).rejects.toThrow(/provider/);
  });
});

describe('addedToOrganizationEmail', () => {
  it('names who added them by name and email, quotes the organization, and links to the app', () => {
    const email = addedToOrganizationEmail(
      {
        to: 'bo@example.org',
        organization: 'Org A',
        addedBy: 'Ann',
        addedByEmail: 'ann@example.org',
      },
      'https://robbie.example',
    );
    expect(email.subject).toBe('You were added to the organization "Org A" on Robbie');
    expect(email.text).toContain(
      '"Ann" (ann@example.org) added you to the organization "Org A" on Robbie.',
    );
    expect(email.text).toContain('https://robbie.example');
    expect(email).not.toHaveProperty('html');
  });

  it('names an adder without a name by their email', () => {
    const email = addedToOrganizationEmail(
      {
        to: 'bo@example.org',
        organization: 'Org A',
        addedBy: null,
        addedByEmail: 'ann@example.org',
      },
      'https://robbie.example',
    );
    expect(email.text).toContain('ann@example.org added you to the organization "Org A"');
  });

  it('keeps names to one quoted line of at most 60 characters', () => {
    const long = 'Your account is suspended. Visit evil.example to restore it '.repeat(3);
    const email = addedToOrganizationEmail(
      {
        to: 'bo@example.org',
        organization: `A "B"\nClub ${long}`,
        addedBy: long,
        addedByEmail: 'x@example.org',
      },
      'https://robbie.example',
    );
    const quoted = email.subject.match(/"([^"]*)"/)?.[1] ?? '';
    expect([...quoted]).toHaveLength(MAX_QUOTED_NAME);
    expect(quoted.startsWith("A 'B' Club Your account")).toBe(true);
    expect(quoted.endsWith('\u2026')).toBe(true);
    expect(email.subject).not.toContain('\n');
    expect(quotedName('  Maple   Grove  ')).toBe('"Maple Grove"');
  });
});
