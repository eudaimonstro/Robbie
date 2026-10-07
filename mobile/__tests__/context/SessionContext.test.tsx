import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

jest.mock('../../lib/storage', () => ({
  getToken: jest.fn(),
  storeToken: jest.fn(async () => {}),
  removeToken: jest.fn(async () => {}),
}));
jest.mock('../../lib/api', () => ({
  getMe: jest.fn(),
  requestCode: jest.fn(async () => {}),
  verifyCode: jest.fn(),
  updateName: jest.fn(),
  acceptTerms: jest.fn(async () => true),
  signOut: jest.fn(async () => {}),
}));

import * as storage from '../../lib/storage';
import * as api from '../../lib/api';
import { SessionProvider, useSession } from '../../context/SessionContext';

const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);
const ann = { id: 1, email: 'ann@example.org', name: 'Ann' };
type TestUser = { id: number; email: string; name: string | null };
/** What getMe answers for a signed-in user */
const me = (user: TestUser = ann, termsAccepted = true) => ({ user, termsAccepted });

async function restored(answer = me()) {
  (storage.getToken as jest.Mock).mockResolvedValue('tok');
  (api.getMe as jest.Mock).mockResolvedValue(answer);
  const hook = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(hook.result.current.status).toBe('signedIn'));
  return hook;
}

describe('SessionProvider (mobile)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('restores the session and the terms acceptance from the secure store on launch', async () => {
    const { result } = await restored(me(ann, false));
    expect(result.current.user).toEqual(ann);
    expect(result.current.token).toBe('tok');
    expect(result.current.termsAccepted).toBe(false);
  });

  it('forgets a token the server no longer accepts', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue('old');
    (api.getMe as jest.Mock).mockResolvedValue(null);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(storage.removeToken).toHaveBeenCalled();
  });

  it('signs in, checks the terms, stores the token, and signs out', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue(null);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    (api.verifyCode as jest.Mock).mockResolvedValue({ user: ann, token: 'new' });
    (api.getMe as jest.Mock).mockResolvedValue(me(ann, false));
    await act(() => result.current.verify('ann@example.org', '123456'));
    expect(storage.storeToken).toHaveBeenCalledWith('new');
    expect(api.getMe).toHaveBeenCalledWith('new');
    expect(result.current.status).toBe('signedIn');
    expect(result.current.termsAccepted).toBe(false);

    await act(() => result.current.signOut());
    expect(api.signOut).toHaveBeenCalledWith('new');
    expect(storage.removeToken).toHaveBeenCalled();
    expect(result.current.status).toBe('signedOut');
  });

  it("asks for the terms after signing in when they couldn't be checked", async () => {
    (storage.getToken as jest.Mock).mockResolvedValue(null);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    (api.verifyCode as jest.Mock).mockResolvedValue({ user: ann, token: 'new' });
    (api.getMe as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    await act(() => result.current.verify('ann@example.org', '123456'));
    expect(result.current.user).toEqual(ann);
    expect(result.current.termsAccepted).toBe(false);
  });

  it('accepts the current terms', async () => {
    const { result } = await restored(me(ann, false));
    await act(() => result.current.acceptTerms());
    expect(api.acceptTerms).toHaveBeenCalledWith('tok');
    expect(result.current.termsAccepted).toBe(true);
  });

  it('forgets the token when accepting finds it no longer works', async () => {
    const { result } = await restored(me(ann, false));
    (api.acceptTerms as jest.Mock).mockResolvedValueOnce(false);
    await act(() => result.current.acceptTerms());
    expect(storage.removeToken).toHaveBeenCalled();
    expect(result.current.status).toBe('signedOut');
  });

  it('shows the terms screen again when told the terms are not accepted', async () => {
    const { result } = await restored();
    await act(async () => result.current.markTermsNotAccepted());
    expect(result.current.termsAccepted).toBe(false);
  });

  it('treats an unreadable secure store as signed out', async () => {
    (storage.getToken as jest.Mock).mockRejectedValue(new Error('Could not decrypt'));
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
  });

  it("keeps the token when the server can't be reached at launch", async () => {
    (storage.getToken as jest.Mock).mockResolvedValue('tok');
    (api.getMe as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unreachable'));
    expect(result.current.token).toBe('tok');
    expect(storage.removeToken).not.toHaveBeenCalled();
  });

  it('is signed in when a retry reaches the server', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue('tok');
    (api.getMe as jest.Mock).mockRejectedValueOnce(new Error("Couldn't load your account"));
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unreachable'));

    (api.getMe as jest.Mock).mockResolvedValueOnce(me());
    await act(() => result.current.retry());
    expect(result.current.status).toBe('signedIn');
    expect(result.current.user).toEqual(ann);
  });

  it('retries when the app comes back to the foreground', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue('tok');
    (api.getMe as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unreachable'));

    const calls = (AppState.addEventListener as jest.Mock).mock.calls;
    const onChange = calls[calls.length - 1][1] as (state: string) => void;
    (api.getMe as jest.Mock).mockResolvedValueOnce(me());
    await act(async () => onChange('active'));
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
  });

  it('is signed out even when the secure store fails to remove the token', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue('old');
    (api.getMe as jest.Mock).mockResolvedValue(null);
    (storage.removeToken as jest.Mock).mockRejectedValueOnce(new Error('Keychain error'));
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
  });

  it('forgets the token when the server no longer accepts it while naming', async () => {
    const { result } = await restored(me({ ...ann, name: null }));
    (api.updateName as jest.Mock).mockResolvedValueOnce(null);
    await act(() => result.current.setName('Ann'));
    expect(storage.removeToken).toHaveBeenCalled();
    expect(result.current.status).toBe('signedOut');
  });
});
