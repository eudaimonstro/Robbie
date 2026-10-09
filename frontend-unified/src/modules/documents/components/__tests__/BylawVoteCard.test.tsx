import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ setVoteRules: vi.fn(async () => ({})) }));
vi.mock('../../../../api/client', () => ({ organizations: { setVoteRules: api.setVoteRules } }));
const org = vi.hoisted(() => ({
  currentOrganization: { id: 'org-1', name: 'Maple Grove HOA' } as {
    id: string;
    name: string;
    bylawAmendmentVote?: string;
  },
  isAdmin: true,
  refreshOrganizations: vi.fn(async () => {}),
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => org,
  useCan: () => org.isAdmin,
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => toast }));

const { BylawVoteCard } = await import('../BylawVoteCard');

describe('BylawVoteCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    org.isAdmin = true;
    org.currentOrganization.bylawAmendmentVote = undefined;
  });

  it('lets an admin set what bylaw amendments need, two thirds of the votes cast at first', async () => {
    render(<BylawVoteCard />);
    const select = screen.getByLabelText('Bylaw amendments need') as HTMLSelectElement;
    expect(select.selectedOptions[0].textContent).toBe('Two thirds of the votes cast');
    fireEvent.change(select, { target: { value: 'twoThirdsMembers' } });
    await waitFor(() =>
      expect(api.setVoteRules).toHaveBeenCalledWith('org-1', {
        bylawAmendmentVote: 'twoThirdsMembers',
      }),
    );
    await waitFor(() => expect(org.refreshOrganizations).toHaveBeenCalled());
    expect(toast.showToast).toHaveBeenCalledWith('success', 'Saved what bylaw amendments need');
  });

  it('shows anyone else the rule', () => {
    org.isAdmin = false;
    org.currentOrganization.bylawAmendmentVote = 'majorityMembers';
    render(<BylawVoteCard />);
    expect(screen.queryByLabelText('Bylaw amendments need')).toBeNull();
    expect(
      screen.getByText('Bylaw amendments need a majority of all the voting members'),
    ).toBeTruthy();
  });
});
