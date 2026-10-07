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
    acceptTerms: vi.fn(async () => ({ termsAccepted: true })),
    signOut: vi.fn(async () => ({ success: true })),
    signOutEverywhere: vi.fn(async () => ({ success: true })),
    requestCode: vi.fn(async () => ({ success: true })),
    signedOutHandler: null as null | (() => void),
    termsHandler: null as null | ((startedAt?: number) => void),
  };
  return { client, HttpError };
});
vi.mock('../../api/client', () => ({
  auth: client,
  HttpError,
  setSignedOutHandler: (h: (() => void) | null) => {
    client.signedOutHandler = h;
  },
  setTermsHandler: (h: ((startedAt?: number) => void) | null) => {
    client.termsHandler = h;
  },
}));

const { SessionProvider, useSession } = await import('../SessionContext');
const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);
const ann = { id: 1, email: 'ann@example.org', name: 'Ann' };
type TestUser = { id: number; email: string; name: string | null };
/** What auth.me answers for a signed-in user */
const me = (user: TestUser = ann, termsAccepted = true) => ({ user, termsAccepted });

async function signedIn(answer = me()) {
  client.me.mockResolvedValueOnce(answer);
  const hook = renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(hook.result.current.status).toBe('signedIn'));
  return hook;
}

describe('SessionProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the signed-in user and whether they accepted the current terms', async () => {
    client.me.mockResolvedValueOnce(me(ann, false));
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.user).toEqual(ann);
    expect(result.current.termsAccepted).toBe(false);
  });

  it('is signed out without a session', async () => {
    client.me.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(result.current.termsAccepted).toBe(false);
  });

  it('signs in, checks the terms, names the user and signs out', async () => {
    client.me.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    client.verify.mockResolvedValueOnce({ ...ann, name: null });
    client.me.mockResolvedValueOnce(me({ ...ann, name: null }, true));
    await act(() => result.current.verify('ann@example.org', '123456'));
    expect(result.current.user?.name).toBeNull();
    expect(result.current.termsAccepted).toBe(true);

    client.updateName.mockResolvedValueOnce(ann);
    await act(() => result.current.setName('Ann'));
    expect(result.current.user).toEqual(ann);

    await act(() => result.current.signOut());
    expect(client.signOut).toHaveBeenCalled();
    expect(result.current.status).toBe('signedOut');
    expect(result.current.termsAccepted).toBe(false);
  });

  it("asks for the terms after signing in when they couldn't be checked", async () => {
    client.me.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    client.verify.mockResolvedValueOnce(ann);
    client.me.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(() => result.current.verify('ann@example.org', '123456'));
    expect(result.current.status).toBe('signedIn');
    expect(result.current.user).toEqual(ann);
    expect(result.current.termsAccepted).toBe(false);
  });

  it('accepts the current terms', async () => {
    const { result } = await signedIn(me(ann, false));
    await act(() => result.current.acceptTerms());
    expect(client.acceptTerms).toHaveBeenCalledOnce();
    expect(result.current.termsAccepted).toBe(true);
  });

  it('keeps asking when the terms changed after the page loaded', async () => {
    const { result } = await signedIn(me(ann, false));
    client.acceptTerms.mockRejectedValueOnce(
      new HttpError('The terms have changed. Reload to see the current terms.', 409),
    );
    await act(() => expect(result.current.acceptTerms()).rejects.toThrow('The terms have changed'));
    expect(result.current.termsAccepted).toBe(false);
    expect(result.current.status).toBe('signedIn');
  });

  it('is signed out when the session ended before accepting', async () => {
    const { result } = await signedIn(me(ann, false));
    client.acceptTerms.mockRejectedValueOnce(new HttpError('Not signed in', 401));
    await act(() =>
      expect(result.current.acceptTerms()).rejects.toThrow('Your sign-in has expired'),
    );
    expect(result.current.status).toBe('signedOut');
  });

  it('shows the terms step again when the API refuses for the terms', async () => {
    const { result } = await signedIn();
    expect(result.current.termsAccepted).toBe(true);
    act(() => client.termsHandler?.());
    expect(result.current.termsAccepted).toBe(false);
    expect(result.current.status).toBe('signedIn');
  });

  it('ignores a refusal of a request made before the terms were accepted', async () => {
    const { result } = await signedIn(me(ann, false));
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    await act(() => result.current.acceptTerms());
    expect(result.current.termsAccepted).toBe(true);

    // A request refused before the acceptance, whose answer arrived after it
    act(() => client.termsHandler?.(999));
    expect(result.current.termsAccepted).toBe(true);

    // One made after the acceptance means the terms changed again
    act(() => client.termsHandler?.(1001));
    expect(result.current.termsAccepted).toBe(false);
    now.mockRestore();
  });

  it('can be told the terms are not accepted, as the socket does', async () => {
    const { result } = await signedIn();
    act(() => result.current.markTermsNotAccepted());
    expect(result.current.termsAccepted).toBe(false);
  });

  it('becomes signed out when the API reports a lost session', async () => {
    const { result } = await signedIn();
    act(() => client.signedOutHandler?.());
    expect(result.current.status).toBe('signedOut');
  });

  it('is unreachable, not signed out, when the session check fails', async () => {
    client.me.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unreachable'));

    client.me.mockResolvedValueOnce(me());
    await act(() => result.current.retry());
    expect(result.current.status).toBe('signedIn');
    expect(result.current.user).toEqual(ann);
    expect(result.current.termsAccepted).toBe(true);
  });

  it('stays signed in when the sign-out request never reaches the server', async () => {
    const { result } = await signedIn();
    client.signOut.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(() =>
      expect(result.current.signOut()).rejects.toThrow(
        "Couldn't sign out. Check your connection and try again.",
      ),
    );
    expect(result.current.status).toBe('signedIn');
  });

  it('stays signed in when a proxy answers the sign-out with an error', async () => {
    const { result } = await signedIn();
    client.signOut.mockRejectedValueOnce(new HttpError('HTTP 502', 502));
    await act(() =>
      expect(result.current.signOut()).rejects.toThrow(
        "Couldn't sign out. Check your connection and try again.",
      ),
    );
    expect(result.current.status).toBe('signedIn');
  });

  it('is signed out when the sign-out finds the session already ended', async () => {
    const { result } = await signedIn();
    client.signOut.mockRejectedValueOnce(new HttpError('Not signed in', 401));
    await act(() => result.current.signOut());
    expect(result.current.status).toBe('signedOut');
  });

  it('stays signed in when signing out everywhere fails', async () => {
    const { result } = await signedIn();
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
    const { result } = await signedIn(me({ ...ann, name: null }));
    client.updateName.mockRejectedValueOnce(new HttpError('Not signed in', 401));
    await act(() =>
      expect(result.current.setName('Ann')).rejects.toThrow('Your sign-in has expired'),
    );
    expect(result.current.status).toBe('signedOut');
  });
});
