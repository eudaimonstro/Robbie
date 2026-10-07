import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const session = vi.hoisted(() => ({
  status: 'signedOut' as 'signedOut' | 'signedIn',
  user: null as null | { id: number; email: string; name: string | null },
  termsAccepted: true as boolean,
  requestCode: vi.fn(async () => {}),
  verify: vi.fn(),
  setName: vi.fn(async () => {}),
  acceptTerms: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
}));
vi.mock('../../context/SessionContext', () => ({ useSession: () => session }));

const { default: SignInPage } = await import('../SignInPage');

function DocumentSpy() {
  const location = useLocation();
  return <p>{`document ${location.pathname}${location.search}${location.hash}`}</p>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/documents/d1" element={<p>Document page</p>} />
        <Route path="/documents/:id" element={<DocumentSpy />} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SignInPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.status = 'signedOut';
    session.user = null;
    session.termsAccepted = true;
    // The last existing test makes setName throw; clearAllMocks keeps implementations
    session.setName.mockImplementation(async () => {});
  });

  it('signs in with an emailed code and returns to the page asked for', async () => {
    session.verify.mockImplementation(async () => {
      session.status = 'signedIn';
      session.user = { id: 1, email: 'ann@example.org', name: 'Ann' };
      return session.user;
    });
    renderAt('/sign-in?next=%2Fdocuments%2Fd1');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ann@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await waitFor(() => expect(session.requestCode).toHaveBeenCalledWith('ann@example.org'));

    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.queryByText('Document page')).not.toBeNull());
    expect(session.verify).toHaveBeenCalledWith('ann@example.org', '123456');
  });

  it('asks a new user for a name before going on', async () => {
    session.verify.mockImplementation(async () => {
      session.status = 'signedIn';
      session.user = { id: 1, email: 'ann@example.org', name: null };
      return session.user;
    });
    renderAt('/sign-in');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ann@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Ann' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(session.setName).toHaveBeenCalledWith('Ann'));
  });

  it("shows the server's message for a wrong code", async () => {
    session.verify.mockRejectedValue(new Error('That code is wrong or has expired'));
    renderAt('/sign-in');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ann@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '000001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('That code is wrong or has expired')).toBeTruthy();
  });

  it('ignores a next address that leaves the app', async () => {
    session.status = 'signedIn';
    session.user = { id: 1, email: 'ann@example.org', name: 'Ann' };
    renderAt('/sign-in?next=https%3A%2F%2Fevil.example');
    expect(await screen.findByText('Home')).toBeTruthy();
  });

  it.each([
    ['//evil.com', '%2F%2Fevil.com'],
    ['/\\evil.com', '%2F%5Cevil.com'],
    ['/<tab>/evil.com', '%2F%09%2Fevil.com'],
  ])('ignores %s, which the browser reads as another site', async (_next, encoded) => {
    session.status = 'signedIn';
    session.user = { id: 1, email: 'ann@example.org', name: 'Ann' };
    renderAt(`/sign-in?next=${encoded}`);
    expect(await screen.findByText('Home')).toBeTruthy();
  });

  it('keeps the query and hash of a page inside the app', async () => {
    session.status = 'signedIn';
    session.user = { id: 1, email: 'ann@example.org', name: 'Ann' };
    renderAt(`/sign-in?next=${encodeURIComponent('/documents/x?y=1#z')}`);
    expect(await screen.findByText('document /documents/x?y=1#z')).toBeTruthy();
  });

  it('signs out from the name step to use a different email', async () => {
    session.status = 'signedIn';
    session.user = { id: 1, email: 'ann@example.org', name: null };
    session.signOut.mockImplementation(async () => {
      session.status = 'signedOut';
      session.user = null;
    });
    renderAt('/sign-in');
    fireEvent.click(await screen.findByRole('button', { name: 'Use a different email' }));
    await waitFor(() => expect(session.signOut).toHaveBeenCalled());
    expect(await screen.findByLabelText('Email')).toBeTruthy();
  });

  it('goes back to the email step when the session ends while naming', async () => {
    session.verify.mockImplementation(async () => {
      session.status = 'signedIn';
      session.user = { id: 1, email: 'ann@example.org', name: null };
      return session.user;
    });
    session.setName.mockImplementation(async () => {
      session.status = 'signedOut';
      session.user = null;
      throw new Error('Your sign-in has expired. Sign in again.');
    });
    renderAt('/sign-in');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ann@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Ann' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Your sign-in has expired. Sign in again.')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it('has a new user agree to the terms with their name, agreeing first', async () => {
    session.status = 'signedIn';
    session.user = { id: 1, email: 'ann@example.org', name: null };
    session.termsAccepted = false;
    renderAt('/sign-in');

    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Ann' } });
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toHaveProperty('disabled', true);

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: "I'm 13 or older and I agree to the Terms of Service and Privacy Policy",
      }),
    );
    fireEvent.click(continueButton);

    await waitFor(() => expect(session.setName).toHaveBeenCalledWith('Ann'));
    expect(session.acceptTerms).toHaveBeenCalledOnce();
    expect(session.acceptTerms.mock.invocationCallOrder[0]).toBeLessThan(
      session.setName.mock.invocationCallOrder[0],
    );
  });

  it('opens the terms and the privacy policy in a new tab', async () => {
    session.status = 'signedIn';
    session.user = { id: 1, email: 'ann@example.org', name: null };
    session.termsAccepted = false;
    renderAt('/sign-in');

    const terms = await screen.findByRole('link', { name: 'Terms of Service' });
    expect(terms.getAttribute('href')).toBe('/terms');
    expect(terms.getAttribute('target')).toBe('_blank');
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe(
      '/privacy',
    );
  });

  it('asks only for the name when the terms are already accepted', async () => {
    session.status = 'signedIn';
    session.user = { id: 1, email: 'ann@example.org', name: null };
    renderAt('/sign-in');

    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Ann' } });
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(session.setName).toHaveBeenCalledWith('Ann'));
    expect(session.acceptTerms).not.toHaveBeenCalled();
  });
});
