import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({
  getOrganizations: vi.fn(),
  getMeetingOrganization: vi.fn(),
  linkMeeting: vi.fn(),
  unlinkMeeting: vi.fn(),
}));
vi.mock('../../../../api/client', () => ({ bylawSync: api }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => toast }));

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

function renderPanel() {
  render(
    <MemoryRouter>
      <BylawyerLinkPanel meetingCode="MAPLE1" suggestedOrgId="o1" />
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
