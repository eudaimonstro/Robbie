import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

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
});
