import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { OrganizationWithRole } from '../../api/client';
import type { OrgRole } from '../../utils/roles';

const list = vi.hoisted(() => vi.fn());
vi.mock('../../api/client', () => ({ organizations: { list } }));

const { OrganizationProvider, useOrganization, useCan } = await import('../OrganizationContext');

const org = (id: string, name: string, role: OrgRole = 'member') =>
  ({ id, name, slug: id, role }) as OrganizationWithRole;
const wrapper = ({ children }: { children: ReactNode }) => (
  <OrganizationProvider>{children}</OrganizationProvider>
);

describe('OrganizationProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    list.mockReset();
    list.mockResolvedValueOnce([org('a', 'Alpha'), org('b', 'Beta')]);
  });

  async function selectedAlpha() {
    const hook = renderHook(() => useOrganization(), { wrapper });
    await waitFor(() => expect(hook.result.current.currentOrganization?.id).toBe('a'));
    return hook;
  }

  it('shows a rename of the current organization after a refresh', async () => {
    const { result } = await selectedAlpha();
    list.mockResolvedValueOnce([org('a', 'Alpha Renamed'), org('b', 'Beta')]);

    await act(() => result.current.refreshOrganizations());

    expect(result.current.currentOrganization?.name).toBe('Alpha Renamed');
  });

  it('selects another organization when the current one is deleted', async () => {
    const { result } = await selectedAlpha();
    list.mockResolvedValueOnce([org('b', 'Beta')]);

    await act(() => result.current.refreshOrganizations());

    expect(result.current.currentOrganization?.id).toBe('b');
  });

  it("exposes the user's role in the current organization, and what it allows", async () => {
    list.mockReset();
    list.mockResolvedValueOnce([org('a', 'Alpha', 'secretary')]);
    const { result } = renderHook(
      () => ({ ...useOrganization(), canEdit: useCan('secretary'), canManage: useCan('admin') }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.role).toBe('secretary'));
    expect(result.current.canEdit).toBe(true);
    expect(result.current.canManage).toBe(false);
  });

  it('allows nothing without an organization', async () => {
    list.mockReset();
    list.mockResolvedValueOnce([]);
    const { result } = renderHook(() => ({ ...useOrganization(), canView: useCan('viewer') }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBeNull();
    expect(result.current.canView).toBe(false);
  });
});
