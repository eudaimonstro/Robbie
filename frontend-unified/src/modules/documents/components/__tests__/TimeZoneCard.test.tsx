import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ update: vi.fn(async () => ({})) }));
vi.mock('../../../../api/client', () => ({ organizations: { update: api.update } }));
const org = vi.hoisted(() => ({
  currentOrganization: { id: 'org-1', name: 'Maple Grove HOA', timeZone: 'America/Chicago' },
  isAdmin: true,
  refreshOrganizations: vi.fn(async () => {}),
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => org,
  useCan: () => org.isAdmin,
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => toast }));

const { TimeZoneCard } = await import('../TimeZoneCard');

describe('TimeZoneCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    org.isAdmin = true;
  });

  it("lets an admin change the organization's time zone", async () => {
    render(<TimeZoneCard />);
    const select = screen.getByLabelText('Meetings are held in') as HTMLSelectElement;
    expect(select.value).toBe('America/Chicago');
    expect(select.selectedOptions[0].textContent).toBe('Central Time (Chicago)');
    expect(screen.getByRole('group', { name: 'United States' })).toBeTruthy();
    fireEvent.change(select, { target: { value: 'Europe/Paris' } });
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('org-1', { timeZone: 'Europe/Paris' }),
    );
    await waitFor(() => expect(org.refreshOrganizations).toHaveBeenCalled());
    expect(toast.showToast).toHaveBeenCalledWith('success', 'Time zone saved');
  });

  it('shows anyone else the time zone', () => {
    org.isAdmin = false;
    render(<TimeZoneCard />);
    expect(screen.queryByLabelText('Meetings are held in')).toBeNull();
    expect(screen.getByText('Central Time (Chicago)')).toBeTruthy();
  });

  it('keeps a time zone the list does not know', () => {
    org.currentOrganization.timeZone = 'Etc/Unknown';
    try {
      render(<TimeZoneCard />);
      const select = screen.getByLabelText('Meetings are held in') as HTMLSelectElement;
      expect(select.value).toBe('Etc/Unknown');
    } finally {
      org.currentOrganization.timeZone = 'America/Chicago';
    }
  });
});
