import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useVersionParam } from '../versionParam';

function useWithLocation() {
  return { ...useVersionParam(), location: useLocation() };
}

const at = (path: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };

describe('useVersionParam', () => {
  it('reads the version the link names', () => {
    const { result } = renderHook(useWithLocation, { wrapper: at('/documents/d1?version=v1') });
    expect(result.current.versionId).toBe('v1');
  });

  it('names the version picked, and drops it for the current one', () => {
    const { result } = renderHook(useWithLocation, { wrapper: at('/documents/d1?version=v1') });

    act(() => result.current.chooseVersion('v2', 'v3'));
    expect(result.current.versionId).toBe('v2');
    expect(result.current.location.search).toBe('?version=v2');

    act(() => result.current.chooseVersion('v3', 'v3'));
    expect(result.current.versionId).toBeNull();
    expect(result.current.location.pathname).toBe('/documents/d1');
    expect(result.current.location.search).toBe('');
  });

  it('drops it when told no version', () => {
    const { result } = renderHook(useWithLocation, { wrapper: at('/documents/d1?version=v1') });
    act(() => result.current.chooseVersion(null));
    expect(result.current.versionId).toBeNull();
  });
});
