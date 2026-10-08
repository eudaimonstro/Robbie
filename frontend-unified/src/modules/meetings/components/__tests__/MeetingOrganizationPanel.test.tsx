import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const maple = {
  id: 'o1',
  name: 'Maple Grove HOA',
  slug: 'maple-grove-hoa',
  description: 'The homeowners of Maple Grove',
  role: 'secretary',
};
const chess = {
  id: 'o2',
  name: 'Chess Club',
  slug: 'chess-club',
  description: null,
  role: 'admin',
};
const bridge = vi.hoisted(() => ({
  availableOrganizations: [] as object[],
  setCurrentOrganization: vi.fn(),
}));
vi.mock('../../context/OrganizationBridge', () => ({ useMeetingOrganization: () => bridge }));

const { MeetingOrganizationPanel } = await import('../MeetingOrganizationPanel');

function renderPanel(organizationId: string | null) {
  return render(
    <MemoryRouter initialEntries={['/meetings/MAPLE1']}>
      <Routes>
        <Route
          path="/meetings/:code"
          element={<MeetingOrganizationPanel organizationId={organizationId} />}
        />
        <Route path="/" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MeetingOrganizationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.availableOrganizations = [chess, maple];
  });

  it("names the meeting's organization, with nothing to link or unlink", () => {
    renderPanel('o1');
    expect(screen.getByText('Maple Grove HOA')).toBeTruthy();
    expect(screen.getByText('The homeowners of Maple Grove')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /link/i })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it("opens the meeting's organization's documents, not the header's", () => {
    renderPanel('o1');
    fireEvent.click(screen.getByRole('button', { name: /View Documents/ }));
    expect(bridge.setCurrentOrganization).toHaveBeenCalledWith(maple);
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('shows nothing for an organization the user is not in', () => {
    const { container } = renderPanel('o9');
    expect(container.textContent).toBe('');
  });
});
