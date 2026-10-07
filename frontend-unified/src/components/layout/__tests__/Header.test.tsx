import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const orgState = vi.hoisted(() => {
  const organizations = [
    { id: 'o1', name: 'Maple Grove Homeowners Association', slug: 'maple-grove', role: 'owner' },
  ];
  return {
    organizations,
    currentOrganization: organizations[0],
    setCurrentOrganization: vi.fn(),
  };
});
vi.mock('../../../context/OrganizationContext', () => ({ useOrganization: () => orgState }));
const session = vi.hoisted(() => ({
  user: { id: 1, email: 'ann@example.org', name: 'Ann Chair' },
  signOut: vi.fn(async () => {}),
  signOutEverywhere: vi.fn(async () => {}),
}));
vi.mock('../../../context/SessionContext', () => ({ useSession: () => session }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../api/client', () => ({ search: { query: vi.fn(async () => ({ results: [] })) } }));
vi.mock('../../organizations/NewOrganizationModal', () => ({ NewOrganizationModal: () => null }));

const { default: Header } = await import('../Header');

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header onMenuClick={() => {}} />
    </MemoryRouter>,
  );
}

describe('Header', () => {
  beforeEach(() => vi.clearAllMocks());

  it('collapses the search box to an icon button below xl, which opens it over the header', async () => {
    renderHeader();
    const open = screen.getByRole('button', { name: 'Search' });
    expect(open.className).toContain('xl:hidden');
    // The box itself is only laid out from xl up until the button opens it
    const box = screen.getByRole('textbox', { name: 'Search documents' });
    expect(box.closest('div.hidden')?.className).toContain('xl:block');
    expect(open.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(open);
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(box.closest('div.absolute')?.className).toContain('inset-0');
    await waitFor(() => expect(document.activeElement).toBe(box));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('truncates the organization name, and keeps it out of sight on phones', () => {
    renderHeader();
    const name = screen.getByText('Maple Grove Homeowners Association');
    expect(name.className).toContain('truncate');
    expect(name.parentElement?.className).toBe('sr-only sm:not-sr-only min-w-0');
    // Still the switcher's name for a screen reader
    expect(screen.getByRole('button', { name: /Maple Grove Homeowners Association/ })).toBeTruthy();
  });

  it('shows the user menu as an icon below xl, its name read out but not drawn', () => {
    renderHeader();
    const name = screen.getByText('Ann Chair');
    expect(name.parentElement?.className).toBe('sr-only xl:not-sr-only');
    expect(screen.getByRole('button', { name: /Ann Chair/ })).toBeTruthy();
  });
});
