import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  AUTH_TOKEN: 'robbie_auth_token',
  PENDING_AUTH: 'robbie_pending_auth',
} as const;

interface PendingAuth {
  email: string;
  name: string;
  meetingCode: string;
}

/**
 * Store the JWT auth token
 */
export async function storeToken(token: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
}

/**
 * Retrieve the stored JWT auth token
 */
export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
}

/**
 * Remove the stored JWT auth token
 */
export async function removeToken(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
}

/**
 * Store pending auth state (email, name, meetingCode) during verification
 */
export async function storePendingAuth(data: PendingAuth): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_AUTH, JSON.stringify(data));
}

/**
 * Retrieve pending auth state
 */
export async function getPendingAuth(): Promise<PendingAuth | null> {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_AUTH);
  return data ? JSON.parse(data) : null;
}

/**
 * Remove pending auth state after successful verification
 */
export async function removePendingAuth(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_AUTH);
}

/**
 * Clear all stored auth data (for logout)
 */
export async function clearAuthData(): Promise<void> {
  await AsyncStorage.multiRemove([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.PENDING_AUTH]);
}
