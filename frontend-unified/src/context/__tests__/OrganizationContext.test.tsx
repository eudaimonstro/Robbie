import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Organization } from '../../api/client';

const list = vi.hoisted(() => vi.fn());
vi.mock('../../api/client', () => ({ organizations: { list } }));

const { OrganizationProvider, useOrganization } = await import('../OrganizationContext');

const org = (id: string, name: string) => ({ id, name, slug: id }) as Organization;
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
});
