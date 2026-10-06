import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const { client, HttpError } = vi.hoisted(() => {
  class HttpError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  const client = {
    me: vi.fn(),
    verify: vi.fn(),
    updateName: vi.fn(),
    signOut: vi.fn(async () => ({ success: true })),
    signOutEverywhere: vi.fn(async () => ({ success: true })),
    requestCode: vi.fn(async () => ({ success: true })),
    handler: null as null | (() => void),
  };
  return { client, HttpError };
});
vi.mock('../../api/client', () => ({
  auth: client,
  HttpError,
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

  it('is unreachable, not signed out, when the session check fails', async () => {
    client.me.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unreachable'));

    client.me.mockResolvedValueOnce(ann);
    await act(() => result.current.retry());
    expect(result.current.status).toBe('signedIn');
    expect(result.current.user).toEqual(ann);
  });

  it('stays signed in when the sign-out request never reaches the server', async () => {
    client.me.mockResolvedValueOnce(ann);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));

    client.signOut.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(() =>
      expect(result.current.signOut()).rejects.toThrow(
        "Couldn't sign out. Check your connection and try again.",
      ),
    );
    expect(result.current.status).toBe('signedIn');
  });

  it('stays signed in when a proxy answers the sign-out with an error', async () => {
    client.me.mockResolvedValueOnce(ann);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));

    client.signOut.mockRejectedValueOnce(new HttpError('HTTP 502', 502));
    await act(() =>
      expect(result.current.signOut()).rejects.toThrow(
        "Couldn't sign out. Check your connection and try again.",
      ),
    );
    expect(result.current.status).toBe('signedIn');
  });

  it('is signed out when the sign-out finds the session already ended', async () => {
    client.me.mockResolvedValueOnce(ann);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));

    client.signOut.mockRejectedValueOnce(new HttpError('Not signed in', 401));
    await act(() => result.current.signOut());
    expect(result.current.status).toBe('signedOut');
  });

  it('stays signed in when signing out everywhere fails', async () => {
    client.me.mockResolvedValueOnce(ann);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));

    client.signOutEverywhere.mockRejectedValueOnce(new HttpError('Failed to sign out', 500));
    await act(() =>
      expect(result.current.signOutEverywhere()).rejects.toThrow('Failed to sign out'),
    );
    expect(result.current.status).toBe('signedIn');

    client.signOutEverywhere.mockRejectedValueOnce(new HttpError('Not signed in', 401));
    await act(() => result.current.signOutEverywhere());
    expect(result.current.status).toBe('signedOut');
  });

  it('is signed out when the server no longer accepts the session while naming', async () => {
    client.me.mockResolvedValueOnce({ ...ann, name: null });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));

    client.updateName.mockRejectedValueOnce(new HttpError('Not signed in', 401));
    await act(() =>
      expect(result.current.setName('Ann')).rejects.toThrow('Your sign-in has expired'),
    );
    expect(result.current.status).toBe('signedOut');
  });
});
