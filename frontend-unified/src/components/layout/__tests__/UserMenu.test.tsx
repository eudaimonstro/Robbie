import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const session = vi.hoisted(() => ({
  user: { id: 1, email: 'ann@example.org', name: 'Ann Chair' },
  signOut: vi.fn(async () => {}),
  signOutEverywhere: vi.fn(async () => {}),
}));
vi.mock('../../../context/SessionContext', () => ({ useSession: () => session }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => toast }));

const { UserMenu } = await import('../UserMenu');

describe('UserMenu', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the user and signs out', async () => {
    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ann Chair/ }));
    expect(screen.getByText('ann@example.org')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(session.signOut).toHaveBeenCalled());
  });

  it('says so when signing out fails', async () => {
    session.signOut.mockRejectedValueOnce(
      new Error("Couldn't sign out. Check your connection and try again."),
    );
    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ann Chair/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() =>
      expect(toast.showToast).toHaveBeenCalledWith(
        'error',
        "Couldn't sign out. Check your connection and try again.",
      ),
    );
  });

  it('says so when signing out everywhere fails', async () => {
    session.signOutEverywhere.mockRejectedValueOnce(new Error('Failed to sign out'));
    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ann Chair/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out on all devices' }));
    await waitFor(() =>
      expect(toast.showToast).toHaveBeenCalledWith('error', 'Failed to sign out'),
    );
  });
});
