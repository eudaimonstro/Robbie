import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  changeRole: vi.fn(async () => ({})),
  remove: vi.fn(async () => {}),
  cancelInvite: vi.fn(async () => {}),
}));
vi.mock('../../../../api/client', () => ({ members: api }));
const orgState = vi.hoisted(() => ({
  rank: ['viewer', 'member', 'secretary', 'admin', 'owner'],
  currentOrganization: { id: 'o1', name: 'Maple Grove HOA', role: 'admin' },
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => ({
    currentOrganization: orgState.currentOrganization,
    role: orgState.currentOrganization.role,
  }),
  useCan: (min: string) =>
    orgState.rank.indexOf(orgState.currentOrganization.role) >= orgState.rank.indexOf(min),
}));
vi.mock('../../../../context/SessionContext', () => ({
  useSession: () => ({ user: { id: 2, email: 'dana@maplegrove.example', name: 'Dana Okafor' } }),
}));

const { MembersCard } = await import('../MembersCard');

const people = {
  members: [
    { userId: 1, name: 'Pat Lindqvist', email: 'pat@maplegrove.example', role: 'owner' },
    { userId: 2, name: 'Dana Okafor', email: 'dana@maplegrove.example', role: 'admin' },
    { userId: 4, name: 'Alice Brennan', email: 'alice@maplegrove.example', role: 'member' },
  ],
  invites: [{ id: 'i1', email: 'new@example.org', role: 'member', createdAt: '' }],
};

function addByEmail(email: string, role?: string) {
  fireEvent.change(screen.getByLabelText('Add by email'), { target: { value: email } });
  if (role) fireEvent.change(screen.getByLabelText('Role'), { target: { value: role } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
}

describe('MembersCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgState.currentOrganization = { id: 'o1', name: 'Maple Grove HOA', role: 'admin' };
    api.list.mockResolvedValue(people);
  });

  it('shows a viewer the members and their roles, and nothing to change', async () => {
    orgState.currentOrganization = { ...orgState.currentOrganization, role: 'viewer' };
    api.list.mockResolvedValue({ members: people.members });
    render(<MembersCard />);
    expect(await screen.findByText('Alice Brennan')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.queryByLabelText('Add by email')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText('new@example.org')).toBeNull();
  });

  it('adds someone by email and says when they will join', async () => {
    api.add.mockResolvedValueOnce({
      status: 'invited',
      invite: { id: 'i2', email: 'kim@example.org', role: 'member', createdAt: '' },
      emailSent: true,
    });
    render(<MembersCard />);
    await screen.findByText('Alice Brennan');
    addByEmail('Kim@Example.org');
    expect(
      await screen.findByText('kim@example.org will join as Member the first time they sign in.'),
    ).toBeTruthy();
    expect(api.add).toHaveBeenCalledWith('o1', 'kim@example.org', 'member');
  });

  it("says when the email couldn't be sent", async () => {
    api.add.mockResolvedValueOnce({
      status: 'added',
      member: { userId: 9, name: 'Kim', email: 'kim@example.org', role: 'secretary' },
      emailSent: false,
    });
    render(<MembersCard />);
    await screen.findByText('Alice Brennan');
    addByEmail('kim@example.org', 'secretary');
    expect(
      await screen.findByText(
        "kim@example.org was added as Secretary. We couldn't email them, so let them know yourself.",
      ),
    ).toBeTruthy();
  });

  it("shows the server's message for the daily limit", async () => {
    const limit = 'This organization has added 20 people today. Try again tomorrow.';
    api.add.mockRejectedValueOnce(new Error(limit));
    render(<MembersCard />);
    await screen.findByText('Alice Brennan');
    addByEmail('kim@example.org');
    expect((await screen.findByRole('alert')).textContent).toBe(limit);
  });

  it('lets an admin change roles up to admin, but not touch an owner', async () => {
    render(<MembersCard />);
    const select = await screen.findByLabelText('Role of Alice Brennan');
    expect(within(select).queryByRole('option', { name: 'Owner' })).toBeNull();
    expect(screen.queryByLabelText('Role of Pat Lindqvist')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove Pat Lindqvist' })).toBeNull();

    fireEvent.change(select, { target: { value: 'secretary' } });
    await waitFor(() => expect(api.changeRole).toHaveBeenCalledWith('o1', 4, 'secretary'));
    expect(await screen.findByText('Alice Brennan is now Secretary.')).toBeTruthy();
  });

  it('removes a member after confirming', async () => {
    render(<MembersCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Alice Brennan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('o1', 4));
  });

  it('cancels a pending addition', async () => {
    render(<MembersCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel adding new@example.org' }));
    await waitFor(() => expect(api.cancelInvite).toHaveBeenCalledWith('o1', 'i1'));
  });
});
