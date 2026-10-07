import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const orgState = vi.hoisted(() => {
  const organization = (role: string) => ({
    id: 'o1',
    name: 'Maple Grove HOA',
    slug: 'maple-grove-hoa',
    description: null,
    createdAt: '2026-10-01T00:00:00Z',
    role,
  });
  return {
    organization,
    rank: ['viewer', 'member', 'secretary', 'admin', 'owner'],
    currentOrganization: organization('viewer') as ReturnType<typeof organization> | null,
    refreshOrganizations: vi.fn(async () => {}),
    setCurrentOrganization: vi.fn(),
  };
});
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => orgState,
  useCan: (min: string) =>
    orgState.currentOrganization !== null &&
    orgState.rank.indexOf(orgState.currentOrganization.role) >= orgState.rank.indexOf(min),
}));
const api = vi.hoisted(() => ({
  update: vi.fn(),
  deleteOrganization: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
}));
vi.mock('../../../../api/client', () => ({
  organizations: { update: api.update, delete: api.deleteOrganization },
  members: { remove: api.remove },
}));
vi.mock('../../../../context/SessionContext', () => ({
  useSession: () => ({
    user: { id: 5, email: 'morgan@maplegrove.example', name: 'Morgan Lee' },
    setName: vi.fn(),
  }),
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../../../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));
const membersCard = vi.hoisted(() => ({ mounts: 0 }));
vi.mock('../../components/MembersCard', async () => {
  const { useEffect } = await import('react');
  return {
    MembersCard: () => {
      useEffect(() => {
        membersCard.mounts++;
      }, []);
      return <p>Members list</p>;
    },
  };
});
vi.mock('../../../../components/organizations/NoOrganizations', () => ({
  NoOrganizations: () => <p>No organizations yet</p>,
}));

const { default: SettingsPage } = await import('../SettingsPage');

function leave() {
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
  fireEvent.click(screen.getByRole('button', { name: 'Leave organization' }));
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgState.currentOrganization = orgState.organization('viewer');
  });

  it('lets a viewer see the members and leave, but not edit or delete', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Members list')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
  });

  it('leaves the organization and lets the refresh pick the next one', async () => {
    leave();
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('o1', 5));
    expect(orgState.refreshOrganizations).toHaveBeenCalled();
    // Dropping the selection first flashed "No organizations yet"
    expect(orgState.setCurrentOrganization).not.toHaveBeenCalled();
  });

  it("shows the server's message when the last owner tries to leave", async () => {
    orgState.currentOrganization = orgState.organization('owner');
    api.remove.mockRejectedValueOnce(new Error('An organization needs at least one owner'));
    leave();
    await waitFor(() =>
      expect(toast.showToast).toHaveBeenCalledWith(
        'error',
        'An organization needs at least one owner',
      ),
    );
    expect(orgState.setCurrentOrganization).not.toHaveBeenCalled();
  });

  it('deletes the organization only after its name is typed', async () => {
    orgState.currentOrganization = orgState.organization('owner');
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('button', { name: 'Delete organization' });
    expect(confirm).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'Maple Grove HOA' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(api.deleteOrganization).toHaveBeenCalledWith('o1'));
    expect(orgState.refreshOrganizations).toHaveBeenCalled();
    expect(orgState.setCurrentOrganization).not.toHaveBeenCalled();
  });

  it('starts the members card afresh after a switch to another organization', () => {
    membersCard.mounts = 0;
    const { rerender } = render(<SettingsPage />);
    expect(membersCard.mounts).toBe(1);

    orgState.currentOrganization = { ...orgState.organization('viewer'), id: 'o2' };
    rerender(<SettingsPage />);

    expect(membersCard.mounts).toBe(2);
  });

  it('offers a way in to a user with no organization', () => {
    orgState.currentOrganization = null;
    render(<SettingsPage />);
    expect(screen.getByText('No organizations yet')).toBeTruthy();
    expect(screen.queryByText('Members list')).toBeNull();
  });
});
