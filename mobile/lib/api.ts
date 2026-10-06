import Constants from 'expo-constants';

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

interface RequestVerificationResponse {
  success: boolean;
  message: string;
}

interface VerifyCodeResponse {
  success: boolean;
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Request a verification code to be sent to the user's email
 */
export async function requestVerification(
  email: string,
  name: string,
  meetingCode: string,
): Promise<RequestVerificationResponse> {
  const response = await fetch(`${API_URL}/api/auth/request-verification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, name, meetingCode }),
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Failed to request verification'));
  }

  return response.json();
}

/**
 * Verify the code and get a JWT token
 */
export async function verifyCode(
  email: string,
  code: string,
  meetingCode: string,
): Promise<VerifyCodeResponse> {
  const response = await fetch(`${API_URL}/api/auth/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, code, meetingCode }),
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Verification failed'));
  }

  return response.json();
}

/**
 * Logout (invalidate token on server)
 */
export async function logout(token: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    // Ignore logout errors - user is logged out locally regardless
  }
}

/**
 * Get the API URL for socket connections
 */
export function getApiUrl(): string {
  return API_URL;
}
