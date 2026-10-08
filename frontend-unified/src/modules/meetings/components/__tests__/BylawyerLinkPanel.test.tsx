import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({
  getOrganizations: vi.fn(),
  getMeetingOrganization: vi.fn(),
  linkMeeting: vi.fn(),
  unlinkMeeting: vi.fn(),
}));
vi.mock('../../../../api/client', () => ({ bylawSync: api }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => toast }));
const bridge = vi.hoisted(() => ({ setCurrentOrganization: vi.fn() }));
vi.mock('../../context/OrganizationBridge', () => ({ useMeetingOrganization: () => bridge }));

const { BylawyerLinkPanel } = await import('../BylawyerLinkPanel');

const maple = {
  id: 'o1',
  name: 'Maple Grove HOA',
  slug: 'maple-grove-hoa',
  description: null,
  role: 'secretary',
};
const chess = {
  id: 'o2',
  name: 'Chess Club',
  slug: 'chess-club',
  description: null,
  role: 'member',
};

function renderPanel({ calledToOrder = false } = {}) {
  render(
    <MemoryRouter initialEntries={['/meetings/MAPLE1']}>
      <Routes>
        <Route
          path="/meetings/:code"
          element={
            <BylawyerLinkPanel
              meetingCode="MAPLE1"
              suggestedOrgId="o1"
              calledToOrder={calledToOrder}
            />
          }
        />
        <Route path="/" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BylawyerLinkPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getOrganizations.mockResolvedValue([maple, chess]);
    api.getMeetingOrganization.mockResolvedValue({ linked: false, organization: null });
  });

  it('offers only organizations where the user is secretary or above', async () => {
    renderPanel();
    expect(await screen.findByRole('option', { name: 'Maple Grove HOA (Current)' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Chess Club/ })).toBeNull();
  });

  it('links the meeting to the suggested organization', async () => {
    api.linkMeeting.mockResolvedValueOnce({ success: true });
    renderPanel();
    await screen.findByRole('option', { name: 'Maple Grove HOA (Current)' });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(api.linkMeeting).toHaveBeenCalledWith('MAPLE1', 'o1'));
  });

  it('lets the user choose no organization over the suggested one', async () => {
    renderPanel();
    const select = await screen.findByLabelText('Organization');
    expect(select).toHaveProperty('value', 'o1');

    fireEvent.change(select, { target: { value: '' } });

    expect(select).toHaveProperty('value', '');
    expect(screen.getByRole('button', { name: 'Link' })).toHaveProperty('disabled', true);
  });

  it("shows the server's message when another organization has the code", async () => {
    api.linkMeeting.mockRejectedValueOnce(new Error('That meeting code is already in use'));
    renderPanel();
    await screen.findByRole('option', { name: 'Maple Grove HOA (Current)' });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() =>
      expect(toast.showToast).toHaveBeenCalledWith('error', 'That meeting code is already in use'),
    );
  });

  it('shows the linked organization, with Unlink only for its secretaries', async () => {
    api.getMeetingOrganization.mockResolvedValue({ linked: true, organization: chess });
    renderPanel();
    expect(await screen.findByText('Chess Club')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Unlink/ })).toBeNull();
  });

  it('unlinks only after asking, and keeps the link when told to', async () => {
    api.getMeetingOrganization.mockResolvedValue({ linked: true, organization: maple });
    api.unlinkMeeting.mockResolvedValue(undefined);
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Unlink Organization' }));
    expect(
      screen.getByText(
        'Unlink Maple Grove HOA? The meeting leaves its schedule, and bylaw amendments passed in it no longer reach its documents.',
      ),
    ).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep the link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep the link' }));
    expect(api.unlinkMeeting).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Unlink Organization' }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unlink Organization' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, unlink' }));
    await waitFor(() => expect(api.unlinkMeeting).toHaveBeenCalledWith('MAPLE1'));
    expect(await screen.findByRole('option', { name: 'Maple Grove HOA (Current)' })).toBeTruthy();
  });

  it('offers no Unlink once the meeting has been called to order', async () => {
    api.getMeetingOrganization.mockResolvedValue({ linked: true, organization: maple });
    renderPanel({ calledToOrder: true });
    expect(await screen.findByText('Maple Grove HOA')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Unlink/ })).toBeNull();
  });

  it("opens the linked organization's documents, not the header's", async () => {
    api.getMeetingOrganization.mockResolvedValue({ linked: true, organization: chess });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /View Documents/ }));
    expect(bridge.setCurrentOrganization).toHaveBeenCalledWith(chess);
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('explains the secretary role when no organization qualifies', async () => {
    api.getOrganizations.mockResolvedValue([chess]);
    renderPanel();
    expect(
      await screen.findByText(
        'You need the secretary role in an organization to link this meeting.',
      ),
    ).toBeTruthy();
  });
});
