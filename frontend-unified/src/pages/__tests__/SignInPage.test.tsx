import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const session = vi.hoisted(() => ({
  status: 'signedOut' as 'signedOut' | 'signedIn',
  user: null as null | { id: number; email: string; name: string | null },
  requestCode: vi.fn(async () => {}),
  verify: vi.fn(),
  setName: vi.fn(async () => {}),
}));
vi.mock('../../context/SessionContext', () => ({ useSession: () => session }));

const { default: SignInPage } = await import('../SignInPage');

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/documents/d1" element={<p>Document page</p>} />
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
});
