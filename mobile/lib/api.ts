import Constants from 'expo-constants';

// Get API URL from Expo constants or use default
const API_URL = Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:3001';

interface ApiError {
  message: string;
  code?: string;
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
  meetingCode: string
): Promise<RequestVerificationResponse> {
  const response = await fetch(`${API_URL}/api/auth/request-verification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, name, meetingCode }),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Failed to request verification');
  }

  return response.json();
}

/**
 * Verify the code and get a JWT token
 */
export async function verifyCode(
  email: string,
  code: string,
  meetingCode: string
): Promise<VerifyCodeResponse> {
  const response = await fetch(`${API_URL}/api/auth/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, code, meetingCode }),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Verification failed');
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
        'Authorization': `Bearer ${token}`,
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
