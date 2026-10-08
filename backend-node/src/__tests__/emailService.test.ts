import { describe, it, expect, afterEach } from 'vitest';
import {
  MAX_QUOTED_NAME,
  addedToOrganizationEmail,
  quotedName,
  captureEmailsForTests,
  captureMemberEmailsForTests,
  sendAddedToOrganization,
  sendSignInCode,
  signInCodeEmail,
} from '../auth/emailService.js';

describe('signInCodeEmail', () => {
  const email = signInCodeEmail('482913');

  it('puts the code first in the subject, where a phone shows it without opening the mail', () => {
    expect(email.subject).toBe('482913 is your Robbie code');
  });

  it('says what the code is for and how long it works, in the text and the page', () => {
    for (const body of [email.text, email.html]) {
      expect(body).toContain('482913');
      expect(body).toContain('15 minutes');
      expect(body).toMatch(/didn.t ask for/);
    }
  });

  it("is on the brand: paper and ink, no gradient and no old tagline", () => {
    expect(email.html).toContain('#F7F3EC');
    expect(email.html).toContain('#8B2E25');
    expect(email.html).not.toMatch(/gradient|#4f46e5|Parliamentary Procedure Made Easy/i);
    expect(email.text).not.toContain('Parliamentary Procedure Made Easy');
  });
});

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

  it('says what Robbie is, what to do, and how to sign in, so it reads as no phishing does', () => {
    const { text } = addedToOrganizationEmail(
      {
        to: 'bo@example.org',
        organization: 'Maple Grove HOA',
        addedBy: 'Pat Lindqvist',
        addedByEmail: 'pat@example.org',
      },
      'https://robbie.example',
    );
    // What Robbie is, for this organization
    expect(text).toContain(
      'Robbie is where "Maple Grove HOA" keeps its bylaws and minutes and runs its meetings.',
    );
    // What to do: nothing yet, or sign in with this address; no password
    expect(text).toContain("You don't need to do anything now.");
    expect(text).toContain('sign in with this email address (bo@example.org)');
    expect(text).toContain('no password');
    // Whom to ask, and what to do about a stranger's addition
    expect(text).toContain('Questions? Write to pat@example.org.');
    expect(text).toMatch(/If you don't know "Maple Grove HOA"/);
    expect(text).not.toContain('Parliamentary Procedure Made Easy');
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
