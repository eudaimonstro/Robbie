import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const session = vi.hoisted(() => ({
  user: { id: 1, email: 'ann@example.org', name: 'Ann Chair' },
  signOut: vi.fn(async () => {}),
  signOutEverywhere: vi.fn(async () => {}),
}));
vi.mock('../../../context/SessionContext', () => ({ useSession: () => session }));

const { UserMenu } = await import('../UserMenu');

describe('UserMenu', () => {
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
});
