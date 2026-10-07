import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const orgState = vi.hoisted(() => {
  const organizations = [
    { id: 'o1', name: 'Maple Grove HOA', slug: 'maple-grove-hoa', role: 'owner' },
    { id: 'o2', name: 'Chess Club', slug: 'chess-club', role: 'viewer' },
  ];
  return {
    organizations,
    currentOrganization: organizations[0] as (typeof organizations)[number] | null,
    setCurrentOrganization: vi.fn(),
  };
});
vi.mock('../../../context/OrganizationContext', () => ({ useOrganization: () => orgState }));
vi.mock('../../organizations/NewOrganizationModal', () => ({
  NewOrganizationModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <p>New organization form</p> : null,
}));

const { OrganizationSwitcher } = await import('../OrganizationSwitcher');

function open() {
  render(
    <MemoryRouter>
      <OrganizationSwitcher />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Maple Grove HOA/ }));
}

describe('OrganizationSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgState.currentOrganization = orgState.organizations[0];
  });

  it("lists the user's organizations, each with their role", () => {
    open();
    expect(screen.getByRole('menuitem', { name: /Maple Grove HOA.*Owner/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Chess Club.*Viewer/ })).toBeTruthy();
  });

  it('switches to another organization', () => {
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: /Chess Club/ }));
    expect(orgState.setCurrentOrganization).toHaveBeenCalledWith(orgState.organizations[1]);
  });

  it('opens the new organization form', () => {
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'New organization' }));
    expect(screen.getByText('New organization form')).toBeTruthy();
  });
});
