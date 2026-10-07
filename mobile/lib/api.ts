import Constants from 'expo-constants';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';

// Get API URL from Expo constants or use default
const API_URL = Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:3001';

/**
 * The error message from a failed response. The API sends { error: string } (or
 * { error: { message } }); a body that isn't JSON (a proxy's error page) falls back.
 */
async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    const error = body?.error;
    if (typeof error === 'string') return error;
    if (typeof error?.message === 'string') return error.message;
    if (typeof body?.message === 'string') return body.message;
  } catch {
    // Not JSON
  }
  return fallback;
}

export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
}

/** The signed-in user, and whether they accepted the current Terms of Service and Privacy Policy */
export interface Me {
  user: SessionUser;
  termsAccepted: boolean;
}

const json = { 'Content-Type': 'application/json' };
const bearer = (token: string) => ({ ...json, Authorization: `Bearer ${token}` });

export async function requestCode(email: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/auth/request-code`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error(await errorMessage(response, "Couldn't send the code"));
}

export async function verifyCode(
  email: string,
  code: string,
): Promise<{ user: SessionUser; token: string }> {
  const response = await fetch(`${API_URL}/api/auth/verify`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, code, client: 'mobile' }),
  });
  if (!response.ok) throw new Error(await errorMessage(response, 'Verification failed'));
  return response.json();
}

/** The signed-in user and their terms acceptance, or null when the token no longer works */
export async function getMe(token: string): Promise<Me | null> {
  const response = await fetch(`${API_URL}/api/auth/me`, { headers: bearer(token) });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(await errorMessage(response, "Couldn't load your account"));
  return (await response.json()) as Me;
}

/**
 * Accept the current terms: the version this app shows, so an old app can't accept terms the
 * user never saw. False when the token no longer works.
 */
export async function acceptTerms(token: string): Promise<boolean> {
  const response = await fetch(`${API_URL}/api/auth/accept-terms`, {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify({ version: TERMS_VERSION }),
  });
  if (response.status === 401) return false;
  if (!response.ok) throw new Error(await errorMessage(response, "Couldn't record your agreement"));
  return true;
}

/** The renamed user, or null when the token no longer works */
export async function updateName(token: string, name: string): Promise<SessionUser | null> {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    method: 'PATCH',
    headers: bearer(token),
    body: JSON.stringify({ name }),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(await errorMessage(response, "Couldn't save your name"));
  return ((await response.json()) as { user: SessionUser }).user;
}

/** End the session on the server; the app forgets the token either way */
export async function signOut(token: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/auth/sign-out`, { method: 'POST', headers: bearer(token) });
  } catch {
    // Offline: the token is still removed from the device
  }
}

/**
 * Get the API URL for socket connections
 */
export function getApiUrl(): string {
  return API_URL;
}

/**
 * The web app, where the Terms of Service and Privacy Policy are. In production it is served on
 * the API's origin.
 */
export function getWebUrl(): string {
  return Constants.expoConfig?.extra?.webUrl ?? API_URL;
}
