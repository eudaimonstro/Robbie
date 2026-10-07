import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { OrganizationWithRole } from '../../api/client';
import type { OrgRole } from '../../utils/roles';

const list = vi.hoisted(() => vi.fn());
vi.mock('../../api/client', () => ({ organizations: { list } }));
const session = vi.hoisted(() => ({ user: { id: 1, email: 'ann@example.org', name: 'Ann' } }));
vi.mock('../SessionContext', () => ({ useSession: () => session }));

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
    session.user = { id: 1, email: 'ann@example.org', name: 'Ann' };
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

  it('keeps the list showing while it refreshes', async () => {
    const { result } = await selectedAlpha();
    expect(result.current.loading).toBe(false);
    let finish: (orgs: OrganizationWithRole[]) => void = () => {};
    list.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));

    let refreshed: Promise<void> = Promise.resolve();
    act(() => {
      refreshed = result.current.refreshOrganizations();
    });

    // A refresh used to blank the pages behind a spinner
    expect(result.current.loading).toBe(false);
    expect(result.current.currentOrganization?.id).toBe('a');
    await act(async () => {
      finish([org('a', 'Alpha')]);
      await refreshed;
    });
    expect(result.current.organizations).toHaveLength(1);
  });

  it("remembers each user's own selection", async () => {
    const { result, unmount } = await selectedAlpha();
    act(() => result.current.setCurrentOrganization(org('b', 'Beta')));
    unmount();

    // The same user comes back to Beta
    list.mockResolvedValueOnce([org('a', 'Alpha'), org('b', 'Beta')]);
    const again = renderHook(() => useOrganization(), { wrapper });
    await waitFor(() => expect(again.result.current.currentOrganization?.id).toBe('b'));
    again.unmount();

    // Another user on the same browser starts at their first organization
    session.user = { id: 2, email: 'bob@example.org', name: 'Bob' };
    list.mockResolvedValueOnce([org('b', 'Beta'), org('a', 'Alpha')]);
    const other = renderHook(() => useOrganization(), { wrapper });
    await waitFor(() => expect(other.result.current.currentOrganization?.id).toBe('b'));
    expect(JSON.parse(localStorage.getItem('selectedOrganizationId')!)).toEqual({
      userId: 2,
      id: 'b',
    });
  });

  it('forgets the saved selection once the organization is left or deleted', async () => {
    const { result } = await selectedAlpha();
    expect(localStorage.getItem('selectedOrganizationId')).not.toBeNull();
    list.mockResolvedValueOnce([]);

    await act(() => result.current.refreshOrganizations());

    expect(result.current.currentOrganization).toBeNull();
    expect(localStorage.getItem('selectedOrganizationId')).toBeNull();
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
