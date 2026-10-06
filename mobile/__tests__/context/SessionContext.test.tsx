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
  signOut: jest.fn(async () => {}),
}));

import * as storage from '../../lib/storage';
import * as api from '../../lib/api';
import { SessionProvider, useSession } from '../../context/SessionContext';

const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);
const ann = { id: 1, email: 'ann@example.org', name: 'Ann' };

describe('SessionProvider (mobile)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('restores the session from the secure store on launch', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue('tok');
    (api.getMe as jest.Mock).mockResolvedValue(ann);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.user).toEqual(ann);
    expect(result.current.token).toBe('tok');
  });

  it('forgets a token the server no longer accepts', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue('old');
    (api.getMe as jest.Mock).mockResolvedValue(null);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(storage.removeToken).toHaveBeenCalled();
  });

  it('signs in, stores the token, and signs out', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue(null);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    (api.verifyCode as jest.Mock).mockResolvedValue({ user: ann, token: 'new' });
    await act(() => result.current.verify('ann@example.org', '123456'));
    expect(storage.storeToken).toHaveBeenCalledWith('new');
    expect(result.current.status).toBe('signedIn');

    await act(() => result.current.signOut());
    expect(api.signOut).toHaveBeenCalledWith('new');
    expect(storage.removeToken).toHaveBeenCalled();
    expect(result.current.status).toBe('signedOut');
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

    (api.getMe as jest.Mock).mockResolvedValueOnce(ann);
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
    (api.getMe as jest.Mock).mockResolvedValueOnce(ann);
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
    (storage.getToken as jest.Mock).mockResolvedValue('tok');
    (api.getMe as jest.Mock).mockResolvedValue({ ...ann, name: null });
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));

    (api.updateName as jest.Mock).mockResolvedValueOnce(null);
    await act(() => result.current.setName('Ann'));
    expect(storage.removeToken).toHaveBeenCalled();
    expect(result.current.status).toBe('signedOut');
  });
});
