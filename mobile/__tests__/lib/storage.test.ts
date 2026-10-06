const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

import {
  getMeetingCode,
  getToken,
  removeToken,
  storeMeetingCode,
  storeToken,
} from '../../lib/storage';

describe('session token storage', () => {
  it('keeps the token in the secure store', async () => {
    await storeToken('tok');
    expect(mockStore.get('robbie_session_token')).toBe('tok');
    expect(await getToken()).toBe('tok');
    await removeToken();
    expect(await getToken()).toBeNull();
  });
});

describe('remembered meeting', () => {
  it('belongs to the user who joined it', async () => {
    await storeMeetingCode(1, 'DEMO');
    expect(await getMeetingCode(1)).toBe('DEMO');
    // Someone else signing in on the same phone doesn't get the previous user's meeting
    expect(await getMeetingCode(2)).toBeNull();
    await storeMeetingCode(1, null);
    expect(await getMeetingCode(1)).toBeNull();
  });
});
