import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import TermsPage from '../TermsPage';
import PrivacyPage from '../PrivacyPage';
import { DmcaAgentDetails } from '../LegalPage';
import {
  ABUSE_EMAIL,
  DMCA_AGENT,
  PRIVACY_EMAIL,
  PROVIDER_NAME,
  providerName,
} from '../legalContact';

const mailLink = (email: string) =>
  screen.getAllByRole('link', { name: email }).map((link) => link.getAttribute('href'));

describe('legal pages', () => {
  it('shows the terms as a dated draft', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeTruthy();
    expect(screen.getByText('Draft, not yet reviewed by a lawyer.')).toBeTruthy();
    expect(screen.getByText(`Version ${TERMS_VERSION}`)).toBeTruthy();
    expect(screen.getByText(/You must be 13 or older/)).toBeTruthy();
    expect(screen.getByText(/does not give legal or parliamentary advice/)).toBeTruthy();
  });

  it('names prohibited content, the copyright process and where to report', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    );
    for (const heading of ['Prohibited content', 'Copyright', 'Reporting a problem']) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy();
    }
    expect(screen.getByText(/Child sexual abuse material\. Robbie reports it/)).toBeTruthy();
    expect(screen.getByText(/National Center for Missing & Exploited Children/)).toBeTruthy();
    expect(screen.getByText(/under penalty of perjury/)).toBeTruthy();
    expect(screen.getByText(/counter-notice/).textContent).toMatch(
      /Robbie restores the material 10 to 14 business\s+days later/,
    );
    expect(screen.getByText(/infringe copyright repeatedly/)).toBeTruthy();
    expect(mailLink(ABUSE_EMAIL)).toEqual([`mailto:${ABUSE_EMAIL}`]);
    expect(mailLink(DMCA_AGENT.email)).toEqual([`mailto:${DMCA_AGENT.email}`]);
    expect(mailLink(PRIVACY_EMAIL)).toEqual([`mailto:${PRIVACY_EMAIL}`]);
  });

  it('names who provides Robbie, or "the operator of Robbie" until the name is filled in', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    );
    expect(PROVIDER_NAME).toBe('');
    expect(screen.getByText(/which the operator of Robbie provides/)).toBeTruthy();
    expect(providerName('')).toBe('the operator of Robbie');
    expect(providerName('  Jane Doe ')).toBe('Jane Doe');
  });

  it("shows only the agent's email until the agent is registered", () => {
    const { container } = render(
      <DmcaAgentDetails
        agent={{ name: '', postalAddress: [], phone: '', email: 'copyright@example.org' }}
      />,
    );
    expect(container.textContent).toBe('Email: copyright@example.org');
  });

  it("shows the registered agent's name, address and phone", () => {
    const { container } = render(
      <DmcaAgentDetails
        agent={{
          name: 'Copyright Agent',
          postalAddress: ['100 Main St', 'Springfield, IL 62701'],
          phone: '555-0100',
          email: 'copyright@example.org',
        }}
      />,
    );
    const lines = Array.from(container.querySelectorAll('address > div')).map(
      (line) => line.textContent,
    );
    expect(lines).toEqual([
      'Copyright Agent',
      '100 Main St',
      'Springfield, IL 62701',
      'Phone: 555-0100',
      'Email: copyright@example.org',
    ]);
  });

  it('says what the privacy policy keeps and who sends the email', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeTruthy();
    expect(screen.getByText('Draft, not yet reviewed by a lawyer.')).toBeTruthy();
    expect(screen.getByText(/through Resend/)).toBeTruthy();
    expect(screen.getByText(/and your votes/)).toBeTruthy();
    expect(screen.getByText(/reports child\s+sexual abuse material/)).toBeTruthy();
    expect(screen.getByText(/provided by the operator of Robbie/)).toBeTruthy();
    expect(
      screen.getByText(/Content removed after a report/).textContent?.replace(/\s+/g, ' '),
    ).toMatch(
      /infringes copyright, malware or child sexual abuse material.*at least a year in a restricted folder/,
    );
    expect(mailLink(PRIVACY_EMAIL)).toEqual([`mailto:${PRIVACY_EMAIL}`]);
  });
});
