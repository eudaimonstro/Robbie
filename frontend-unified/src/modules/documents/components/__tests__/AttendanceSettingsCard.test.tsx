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
  },
  isAdmin: true,
  refreshOrganizations: vi.fn(async () => {}),
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => orgState,
  useCan: () => orgState.isAdmin,
}));
const api = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('../../../../api/client', () => ({ organizations: { update: api.update } }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const { AttendanceSettingsCard } = await import('../AttendanceSettingsCard');

describe('AttendanceSettingsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgState.isAdmin = true;
    api.update.mockResolvedValue({});
  });

  it('shows the voting members and the quorum every meeting starts from', () => {
    orgState.isAdmin = false;
    render(<AttendanceSettingsCard />);
    expect(screen.getByText('142')).toBeTruthy();
    expect(screen.getByText('20% of the voting members')).toBeTruthy();
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

  it('counts the members list when no number of voting members is given', async () => {
    render(<AttendanceSettingsCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit attendance' }));
    fireEvent.change(screen.getByLabelText('Voting members'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('o1', { eligibleVoters: null, quorumPercent: 20 }),
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
});
