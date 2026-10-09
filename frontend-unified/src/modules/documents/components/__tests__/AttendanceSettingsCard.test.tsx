import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const orgState = vi.hoisted(() => ({
  currentOrganization: {
    id: 'o1',
    name: 'Maple Grove HOA',
    slug: 'maple-grove-hoa',
    role: 'admin',
    eligibleVoters: 142 as number | null,
    quorumPercent: 20 as number | null,
    quorumCount: null as number | null,
    boardQuorum: null as number | null,
  },
  isAdmin: true,
  refreshOrganizations: vi.fn(async () => {}),
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => orgState,
  useCan: () => orgState.isAdmin,
}));
const api = vi.hoisted(() => ({ update: vi.fn(), listMembers: vi.fn() }));
vi.mock('../../../../api/client', () => ({
  organizations: { update: api.update },
  members: { list: api.listMembers },
}));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const { AttendanceSettingsCard } = await import('../AttendanceSettingsCard');

describe('AttendanceSettingsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgState.isAdmin = true;
    orgState.currentOrganization.eligibleVoters = 142;
    orgState.currentOrganization.quorumPercent = 20;
    orgState.currentOrganization.quorumCount = null;
    orgState.currentOrganization.boardQuorum = null;
    api.update.mockResolvedValue({});
    // Five board members
    api.listMembers.mockResolvedValue({
      members: [1, 2, 3, 4, 5, 6].map((userId) => ({
        userId,
        role: 'member',
        isDirector: userId < 6,
      })),
    });
  });

  it('shows the voting members and the quorum every meeting starts from', () => {
    orgState.isAdmin = false;
    render(<AttendanceSettingsCard />);
    expect(screen.getByText('142')).toBeTruthy();
    expect(screen.getByText('20% of the 142 voting members (29 people)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit attendance' })).toBeNull();
  });

  it('lets an admin set the quorum as a number of people', async () => {
    render(<AttendanceSettingsCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit attendance' }));
    fireEvent.click(screen.getByLabelText('A number of people'));
    fireEvent.change(screen.getByLabelText('Quorum count'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('o1', { eligibleVoters: 142, quorumCount: 25 }),
    );
    expect(orgState.refreshOrganizations).toHaveBeenCalled();
  });

  it('asks for them when they are not set, as with the old default of 3 people', async () => {
    orgState.currentOrganization.eligibleVoters = null;
    orgState.currentOrganization.quorumPercent = null;
    orgState.currentOrganization.quorumCount = 3;
    render(<AttendanceSettingsCard />);
    expect(screen.getAllByText('Not set')).toHaveLength(2);
    expect(
      screen.getByText(
        'Set the voting members and the quorum from your bylaws: no meeting can open until they are set.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit attendance' }));
    // Nothing guessed
    expect((screen.getByLabelText('Voting members') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      screen.getByText('Give the number of voting members: a whole number, 1 or more'),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Voting members'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Quorum percentage'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('o1', { eligibleVoters: 60, quorumPercent: 25 }),
    );
  });

  it('refuses a percentage over 100', () => {
    render(<AttendanceSettingsCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit attendance' }));
    fireEvent.change(screen.getByLabelText('Quorum percentage'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('The quorum is a percentage from 1 to 100')).toBeTruthy();
    expect(api.update).not.toHaveBeenCalled();
  });

  it("sets the board's quorum, or leaves it to a majority of the board", async () => {
    render(<AttendanceSettingsCard />);
    expect(screen.getByText('A majority of the board')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit attendance' }));
    fireEvent.change(screen.getByLabelText('Board quorum (optional)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      screen.getByText('The board quorum is a whole number of board members, from 1 to 25'),
    ).toBeTruthy();
    // No more than the five board members
    await screen.findByText(/\(5 members, marked on the Members page\)/);
    fireEvent.change(screen.getByLabelText('Board quorum (optional)'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      screen.getByText("The board quorum can't be more than the 5 board members"),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Board quorum (optional)'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('o1', {
        eligibleVoters: 142,
        quorumPercent: 20,
        boardQuorum: 3,
      }),
    );
  });

  it("shows the board's quorum when set", () => {
    orgState.currentOrganization.boardQuorum = 4;
    render(<AttendanceSettingsCard />);
    expect(screen.getByText('4 board members')).toBeTruthy();
  });
});
