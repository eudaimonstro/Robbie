import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const session = vi.hoisted(() => ({
  acceptTerms: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
}));
vi.mock('../../../context/SessionContext', () => ({ useSession: () => session }));

const { TermsStep } = await import('../TermsStep');
const agreement = "I'm 13 or older and I agree to the Terms of Service and Privacy Policy";

describe('TermsStep', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts the terms once the box is ticked', async () => {
    render(<TermsStep />);
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('checkbox', { name: agreement }));
    fireEvent.click(button);
    await waitFor(() => expect(session.acceptTerms).toHaveBeenCalledOnce());
  });

  it("shows the server's message when the terms changed meanwhile", async () => {
    session.acceptTerms.mockRejectedValueOnce(
      new Error('The terms have changed. Reload to see the current terms.'),
    );
    render(<TermsStep />);
    fireEvent.click(screen.getByRole('checkbox', { name: agreement }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText('The terms have changed. Reload to see the current terms.'),
    ).toBeTruthy();
  });

  it('can sign out instead', async () => {
    render(<TermsStep />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(session.signOut).toHaveBeenCalledOnce());
  });
});
