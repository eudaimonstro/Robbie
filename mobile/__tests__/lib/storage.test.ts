const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

import { getToken, removeToken, storeToken } from '../../lib/storage';

describe('session token storage', () => {
  it('keeps the token in the secure store', async () => {
    await storeToken('tok');
    expect(mockStore.get('robbie_session_token')).toBe('tok');
    expect(await getToken()).toBe('tok');
    await removeToken();
    expect(await getToken()).toBeNull();
  });
});
