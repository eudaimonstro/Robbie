import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { OrganizationWithRole } from '../../api/client';
import type { OrgRole } from '../../utils/roles';

const list = vi.hoisted(() => vi.fn());
vi.mock('../../api/client', () => ({ organizations: { list } }));

const { OrganizationProvider, useOrganization, useCan, useSelectRecordOrganization } =
  await import('../OrganizationContext');

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

  describe('useSelectRecordOrganization', () => {
    it("switches to the record's organization once it loads", async () => {
      const { result, rerender } = renderHook(
        ({ id }: { id?: string }) => {
          useSelectRecordOrganization(id);
          return useOrganization();
        },
        { wrapper, initialProps: {} },
      );
      await waitFor(() => expect(result.current.currentOrganization?.id).toBe('a'));

      rerender({ id: 'b' });

      await waitFor(() => expect(result.current.currentOrganization?.id).toBe('b'));
      expect(result.current.role).toBe('member');
    });

    it('leaves the selection alone for an organization the user is not in', async () => {
      const { result } = renderHook(
        () => {
          useSelectRecordOrganization('other');
          return useOrganization();
        },
        { wrapper },
      );
      await waitFor(() => expect(result.current.currentOrganization?.id).toBe('a'));
      expect(result.current.currentOrganization?.id).toBe('a');
    });
  });
});
