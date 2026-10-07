import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import TermsPage from '../TermsPage';
import PrivacyPage from '../PrivacyPage';

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
  });
});
