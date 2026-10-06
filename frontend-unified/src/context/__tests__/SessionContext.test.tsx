import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const client = vi.hoisted(() => ({
  me: vi.fn(),
  verify: vi.fn(),
  updateName: vi.fn(),
  signOut: vi.fn(async () => ({ success: true })),
  signOutEverywhere: vi.fn(async () => ({ success: true })),
  requestCode: vi.fn(async () => ({ success: true })),
  handler: null as null | (() => void),
}));
vi.mock('../../api/client', () => ({
  auth: client,
  setSignedOutHandler: (h: (() => void) | null) => {
    client.handler = h;
  },
}));

const { SessionProvider, useSession } = await import('../SessionContext');
const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);
const ann = { id: 1, email: 'ann@example.org', name: 'Ann' };

describe('SessionProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the signed-in user', async () => {
    client.me.mockResolvedValueOnce(ann);
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.user).toEqual(ann);
  });

  it('is signed out without a session', async () => {
    client.me.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
  });

  it('signs in, names the user and signs out', async () => {
    client.me.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    client.verify.mockResolvedValueOnce({ ...ann, name: null });
    await act(() => result.current.verify('ann@example.org', '123456'));
    expect(result.current.user?.name).toBeNull();

    client.updateName.mockResolvedValueOnce(ann);
    await act(() => result.current.setName('Ann'));
    expect(result.current.user).toEqual(ann);

    await act(() => result.current.signOut());
    expect(client.signOut).toHaveBeenCalled();
    expect(result.current.status).toBe('signedOut');
  });

  it('becomes signed out when the API reports a lost session', async () => {
    client.me.mockResolvedValueOnce(ann);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    act(() => client.handler?.());
    expect(result.current.status).toBe('signedOut');
  });
});
