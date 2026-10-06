import { useState, useCallback, useMemo } from 'react';
import type { Member } from '@robbie-bylawyer/shared/types';
import type { AuthState } from '../types/socket';
import {
  validateEmail,
  validateName,
  validateMeetingCode,
  validateVerificationCode,
} from '../utils/validators';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const INITIAL_AUTH_STATE: AuthState = {
  email: '',
  name: '',
  meetingCode: '',
  token: null,
  userId: null,
};

function loadSavedAuthState(): AuthState {
  try {
    const saved = localStorage.getItem('robbie_auth');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.token && parsed.meetingCode && parsed.email && parsed.userId) {
        return parsed;
      }
    }
  } catch {
    // Invalid stored data, ignore
  }
  return INITIAL_AUTH_STATE;
}

interface UseAuthReturn {
  authState: AuthState;
  isAuthenticated: boolean;
  login: (email: string, name: string, meetingCode: string) => Promise<void>;
  verifyCode: (code: string) => Promise<boolean>;
  clearAuth: () => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export function useAuth(): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>(loadSavedAuthState);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!(authState.token && authState.meetingCode);

  // Request verification code
  const login = useCallback(async (email: string, name: string, meetingCode: string) => {
    setError(null);

    // Sanitize inputs
    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedName = name.trim();
    const sanitizedCode = meetingCode.trim().toUpperCase();

    // Validate inputs
    const emailError = validateEmail(sanitizedEmail);
    if (emailError) {
      setError(emailError);
      throw new Error(emailError);
    }

    const nameError = validateName(sanitizedName);
    if (nameError) {
      setError(nameError);
      throw new Error(nameError);
    }

    const codeError = validateMeetingCode(sanitizedCode);
    if (codeError) {
      setError(codeError);
      throw new Error(codeError);
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/auth/request-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: sanitizedEmail,
          name: sanitizedName,
          meetingCode: sanitizedCode,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code');
      }

      setAuthState((prev) => ({
        ...prev,
        email: sanitizedEmail,
        name: sanitizedName,
        meetingCode: sanitizedCode,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send verification code';
      setError(message);
      throw err;
    }
  }, []);

  // Verify code and get token
  const verifyCode = useCallback(
    async (code: string): Promise<boolean> => {
      setError(null);

      const codeError = validateVerificationCode(code);
      if (codeError) {
        setError(codeError);
        return false;
      }

      const sanitizedCode = code.trim();

      try {
        const response = await fetch(`${SERVER_URL}/api/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: authState.email,
            code: sanitizedCode,
            meetingCode: authState.meetingCode,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Invalid verification code');
        }

        const newAuthState = {
          email: authState.email,
          name: authState.name,
          meetingCode: authState.meetingCode,
          token: data.token,
          userId: data.user.id,
        };
        setAuthState(newAuthState);

        try {
          localStorage.setItem('robbie_auth', JSON.stringify(newAuthState));
        } catch {
          // localStorage may be unavailable
        }

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed');
        return false;
      }
    },
    [authState.email, authState.meetingCode, authState.name],
  );

  // Clear auth state (called by provider when logging out)
  const clearAuth = useCallback(() => {
    fetch(`${SERVER_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch((err) => {
      console.warn('Logout request failed:', err.message || 'Network error');
    });

    try {
      localStorage.removeItem('robbie_auth');
    } catch {
      // localStorage may be unavailable
    }

    setAuthState(INITIAL_AUTH_STATE);
    setError(null);
  }, []);

  return {
    authState,
    isAuthenticated,
    login,
    verifyCode,
    clearAuth,
    error,
    setError,
  };
}

export function useCurrentUser(authState: AuthState, members: Member[]): Member | null {
  return useMemo(() => {
    if (!authState.userId) return null;
    const foundMember = members.find((m) => m.id === authState.userId);
    if (foundMember) return foundMember;
    return {
      id: authState.userId,
      name: authState.name,
      role: 'member' as const,
      present: true,
    };
  }, [authState.userId, authState.name, members]);
}
