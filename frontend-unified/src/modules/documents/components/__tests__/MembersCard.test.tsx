import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  addBulk: vi.fn(),
  changeRole: vi.fn(async () => ({})),
  remove: vi.fn(async () => {}),
  cancelInvite: vi.fn(async () => {}),
  setDirector: vi.fn(async () => ({})),
}));
vi.mock('../../../../api/client', () => ({ members: api }));
const orgState = vi.hoisted(() => ({
  rank: ['viewer', 'member', 'secretary', 'admin', 'owner'],
  currentOrganization: { id: 'o1', name: 'Maple Grove HOA', role: 'admin' },
  refreshOrganizations: vi.fn(async () => {}),
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => ({
    currentOrganization: orgState.currentOrganization,
    role: orgState.currentOrganization.role,
    refreshOrganizations: orgState.refreshOrganizations,
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
  invites: [
    { id: 'i1', email: 'new@example.org', role: 'member', createdAt: '' },
    { id: 'i2', email: 'rosa@example.org', name: 'Rosa Alvarez', role: 'member', createdAt: '' },
  ],
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
    // The server sends a viewer names and roles, and only their own email
    api.list.mockResolvedValue({
      members: [
        { userId: 1, name: 'Pat Lindqvist', role: 'owner' },
        { userId: 2, name: 'Dana Okafor', email: 'dana@maplegrove.example', role: 'admin' },
        { userId: 4, name: 'Alice Brennan', role: 'member' },
        { userId: 5, name: null, role: 'member' },
      ],
    });
    render(<MembersCard />);
    expect(await screen.findByText('Alice Brennan')).toBeTruthy();
    expect(screen.getByText('A member without a name')).toBeTruthy();
    expect(screen.getByText('dana@maplegrove.example')).toBeTruthy();
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
    expect(api.add).toHaveBeenCalledWith('o1', 'kim@example.org', 'member', undefined);
  });

  it('takes a name for someone added by email, shown until they sign in', async () => {
    api.add.mockResolvedValueOnce({
      status: 'invited',
      invite: { id: 'i3', email: 'kim@example.org', name: 'Kim Lee', role: 'member' },
      emailSent: true,
    });
    render(<MembersCard />);
    // A pending addition with a name shows it beside the email
    expect(await screen.findByText('Rosa Alvarez')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name (optional)'), { target: { value: ' Kim Lee ' } });
    addByEmail('kim@example.org');
    await waitFor(() =>
      expect(api.add).toHaveBeenCalledWith('o1', 'kim@example.org', 'member', 'Kim Lee'),
    );
  });

  it('adds several people from a pasted list, after a preview of each line', async () => {
    api.addBulk.mockResolvedValueOnce({
      results: [
        { email: 'carmen@example.org', status: 'invited' },
        { email: 'rosa@example.org', status: 'updated' },
      ],
    });
    render(<MembersCard />);
    await screen.findByText('Alice Brennan');
    fireEvent.click(screen.getByRole('button', { name: 'Add several people' }));
    fireEvent.change(screen.getByLabelText('People, one per line'), {
      target: {
        value: [
          'Carmen Diaz, carmen@example.org',
          'Alice Brennan <alice@maplegrove.example>',
          'Rosa Alvarez\trosa@example.org',
          'Name, Email',
        ].join('\n'),
      },
    });
    expect(screen.getByRole('status').textContent).toBe(
      '1 person to add, 1 waiting to sign in, 1 already a member, 1 line to fix',
    );
    const list = screen.getByRole('list', { name: 'The list, line by line' });
    expect(within(list).getByText('Already a member')).toBeTruthy();
    expect(within(list).getByText('No email address on this line')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Role for everyone on the list'), {
      target: { value: 'secretary' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 people' }));

    await waitFor(() =>
      expect(api.addBulk).toHaveBeenCalledWith(
        'o1',
        [
          { email: 'carmen@example.org', name: 'Carmen Diaz' },
          { email: 'rosa@example.org', name: 'Rosa Alvarez' },
        ],
        'secretary',
      ),
    );
    expect(
      await screen.findByText(
        'Added 1 person as Secretary. Updated 1 waiting addition. 1 line left out to fix.',
      ),
    ).toBeTruthy();
    // The list is read again with them
    expect(api.list).toHaveBeenCalledTimes(2);
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

  it('lets an admin change their own role, but not remove themselves', async () => {
    render(<MembersCard />);
    const select = await screen.findByLabelText('Role of Dana Okafor');
    expect(within(select).queryByRole('option', { name: 'Owner' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove Dana Okafor' })).toBeNull();

    fireEvent.change(select, { target: { value: 'member' } });
    await waitFor(() => expect(api.changeRole).toHaveBeenCalledWith('o1', 2, 'member'));
    expect(await screen.findByText('Dana Okafor is now Member.')).toBeTruthy();
    // The header and this page follow the new role
    expect(orgState.refreshOrganizations).toHaveBeenCalled();
  });

  it('lets an owner step down while another owner remains, and says why not otherwise', async () => {
    orgState.currentOrganization = { ...orgState.currentOrganization, role: 'owner' };
    api.list.mockResolvedValue({
      members: [people.members[0], { ...people.members[1], role: 'owner' }],
    });
    render(<MembersCard />);
    fireEvent.change(await screen.findByLabelText('Role of Dana Okafor'), {
      target: { value: 'admin' },
    });
    await waitFor(() => expect(api.changeRole).toHaveBeenCalledWith('o1', 2, 'admin'));
    expect(await screen.findByText('Dana Okafor is now Admin.')).toBeTruthy();

    // As the last owner, the server refuses
    api.changeRole.mockRejectedValueOnce(new Error('An organization needs at least one owner'));
    fireEvent.change(screen.getByLabelText('Role of Dana Okafor'), { target: { value: 'admin' } });
    expect((await screen.findByRole('alert')).textContent).toBe(
      'An organization needs at least one owner',
    );
  });

  it("keeps a change's outcome when the list can't be reloaded", async () => {
    api.list.mockResolvedValueOnce(people).mockRejectedValueOnce(new Error('HTTP 500'));
    render(<MembersCard />);
    const select = await screen.findByLabelText('Role of Alice Brennan');
    fireEvent.change(select, { target: { value: 'secretary' } });
    expect((await screen.findByRole('status')).textContent).toBe(
      "Alice Brennan is now Secretary. The list couldn't be refreshed.",
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('removes a member after confirming', async () => {
    render(<MembersCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Alice Brennan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('o1', 4));
  });

  it("says which lines the server didn't add, and leaves out a spreadsheet's other columns", async () => {
    api.addBulk.mockResolvedValueOnce({
      results: [
        { email: 'a@example.org', status: 'invited' },
        { email: 'boss@example.org', status: 'owner-only' },
      ],
    });
    render(<MembersCard />);
    await screen.findByText('Alice Brennan');
    fireEvent.click(screen.getByRole('button', { name: 'Add several people' }));
    fireEvent.change(screen.getByLabelText('People, one per line'), {
      target: { value: 'Ann Lee\ta@example.org\tLot 12\nboss@example.org' },
    });
    expect(screen.getByText('Left out: Lot 12')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 people' }));
    expect(
      await screen.findByText(
        'Added 1 person as Member. Only an owner can change boss@example.org, waiting to join as an owner.',
      ),
    ).toBeTruthy();
  });

  it('cancels a pending addition', async () => {
    render(<MembersCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel adding new@example.org' }));
    await waitFor(() => expect(api.cancelInvite).toHaveBeenCalledWith('o1', 'i1'));
  });

  describe('the board', () => {
    it('lets an admin mark the board members, only members and above', async () => {
      api.list.mockResolvedValue({
        members: [
          ...people.members,
          { userId: 9, name: 'Morgan Lee', email: 'morgan@maplegrove.example', role: 'viewer' },
        ],
      });
      render(<MembersCard />);
      await screen.findByText('Alice Brennan');
      expect(
        screen.getByText(
          'Mark the board members: they vote in board meetings, and the other members may observe.',
        ),
      ).toBeTruthy();
      // An admin marks an owner too, whose role only an owner changes
      expect(screen.getByRole('checkbox', { name: 'Board member: Pat Lindqvist' })).toBeTruthy();
      expect(screen.queryByRole('checkbox', { name: 'Board member: Morgan Lee' })).toBeNull();

      api.list.mockResolvedValue({
        members: people.members.map((m) => (m.userId === 4 ? { ...m, isDirector: true } : m)),
      });
      fireEvent.click(screen.getByRole('checkbox', { name: 'Board member: Alice Brennan' }));
      await waitFor(() => expect(api.setDirector).toHaveBeenCalledWith('o1', 4, true));
      expect(await screen.findByText('Alice Brennan is on the board.')).toBeTruthy();
      expect(
        (screen.getByRole('checkbox', { name: 'Board member: Alice Brennan' }) as HTMLInputElement)
          .checked,
      ).toBe(true);
      expect(screen.getByText('The board: 1 member, who vote in board meetings.')).toBeTruthy();
    });

    it('shows everyone else who is on the board', async () => {
      orgState.currentOrganization = { ...orgState.currentOrganization, role: 'member' };
      api.list.mockResolvedValue({
        members: [
          { userId: 1, name: 'Pat Lindqvist', role: 'owner', isDirector: true },
          { userId: 4, name: 'Alice Brennan', role: 'member' },
        ],
      });
      render(<MembersCard />);
      await screen.findByText('Alice Brennan');
      expect(screen.queryByRole('checkbox')).toBeNull();
      expect(screen.getAllByText('Board')).toHaveLength(1);
    });
  });
});
