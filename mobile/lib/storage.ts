import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'robbie_session_token';
const MEETING_KEY = 'robbie_meeting_code';

/** The session token, kept in the device's secure store */
export async function storeToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function removeToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** The meeting last joined, to rejoin after the app restarts */
export async function storeMeetingCode(code: string | null): Promise<void> {
  if (code) await AsyncStorage.setItem(MEETING_KEY, code);
  else await AsyncStorage.removeItem(MEETING_KEY);
}

export async function getMeetingCode(): Promise<string | null> {
  return AsyncStorage.getItem(MEETING_KEY);
}
