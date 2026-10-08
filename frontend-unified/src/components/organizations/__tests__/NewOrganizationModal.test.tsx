import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const create = vi.hoisted(() => vi.fn());
vi.mock('../../../api/client', () => ({ organizations: { create } }));
const orgContext = vi.hoisted(() => ({
  refreshOrganizations: vi.fn(async () => {}),
  setCurrentOrganization: vi.fn(),
}));
vi.mock('../../../context/OrganizationContext', () => ({ useOrganization: () => orgContext }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => toast }));

const { NewOrganizationModal } = await import('../NewOrganizationModal');

function renderModal(onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <NewOrganizationModal isOpen onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
}

describe('NewOrganizationModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates the organization with its description and switches to it', async () => {
    const created = { id: 'o9', name: 'Maple Grove HOA', slug: 'maple-grove-hoa', role: 'owner' };
    create.mockResolvedValueOnce(created);
    const onClose = renderModal();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Maple Grove HOA ' } });
    fireEvent.change(screen.getByLabelText('Description (optional)'), {
      target: { value: '142 lots' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => expect(orgContext.setCurrentOrganization).toHaveBeenCalledWith(created));
    // With the creator's time zone (the suite runs in Chicago), for the minutes' times
    expect(create).toHaveBeenCalledWith({
      name: 'Maple Grove HOA',
      description: '142 lots',
      timeZone: 'America/Chicago',
    });
    expect(orgContext.refreshOrganizations).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the server's message, such as the limit on organizations owned", async () => {
    create.mockRejectedValueOnce(new Error('You can own at most 3 organizations'));
    const onClose = renderModal();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fourth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    expect(await screen.findByText('You can own at most 3 organizations')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('says in words when the name is already taken', async () => {
    create.mockRejectedValueOnce(
      new Error("Organization with slug 'maple-grove-hoa' already exists"),
    );
    renderModal();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Maple Grove HOA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    expect(await screen.findByText('An organization with that name already exists')).toBeTruthy();
  });
});
