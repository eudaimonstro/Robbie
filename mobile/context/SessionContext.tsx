import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import * as api from '../lib/api';
import type { SessionUser } from '../lib/api';
import { getToken, removeToken, storeToken } from '../lib/storage';

// 'unreachable': there is a saved token but the server couldn't be reached to check it
export type SessionStatus = 'loading' | 'signedIn' | 'signedOut' | 'unreachable';

interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  token: string | null;
  requestCode: (email: string) => Promise<void>;
  verify: (email: string, code: string) => Promise<SessionUser>;
  setName: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Check the saved session again after the server was unreachable */
  retry: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** The secure store's token, or null when there is none or it can't be read */
async function savedToken(): Promise<string | null> {
  try {
    return await getToken();
  } catch {
    // Android can't decrypt a value restored from a backup onto another device
    return null;
  }
}

/** The signed-in user. The token lives in the secure store and is restored on launch. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const forget = useCallback(async () => {
    try {
      await removeToken();
    } catch {
      // Signed out in the app regardless; the server no longer accepts the token anyway, or
      // the next launch finds it and asks the server again
    }
    setToken(null);
    setUser(null);
    setStatus('signedOut');
  }, []);

  // The restore in progress, so a retry while one runs waits for it instead of starting another
  const restoringRef = useRef<Promise<void> | null>(null);

  const restore = useCallback(() => {
    restoringRef.current ??= (async () => {
      try {
        const saved = await savedToken();
        if (!saved) {
          setStatus('signedOut');
          return;
        }
        let me: SessionUser | null;
        try {
          me = await api.getMe(saved);
        } catch {
          // Offline, or the server failed: keep the token and try again
          setToken(saved);
          setStatus('unreachable');
          return;
        }
        if (!me) {
          await forget();
          return;
        }
        setToken(saved);
        setUser(me);
        setStatus('signedIn');
      } finally {
        restoringRef.current = null;
      }
    })();
    return restoringRef.current;
  }, [forget]);

  useEffect(() => {
    void restore();
  }, [restore]);

  // Try again when the user comes back to the app, since they may be back online
  useEffect(() => {
    if (status !== 'unreachable') return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void restore();
    });
    return () => subscription.remove();
  }, [status, restore]);

  const requestCode = useCallback((email: string) => api.requestCode(email.trim()), []);

  const verify = useCallback(async (email: string, code: string) => {
    const result = await api.verifyCode(email.trim(), code.trim());
    await storeToken(result.token);
    setToken(result.token);
    setUser(result.user);
    setStatus('signedIn');
    return result.user;
  }, []);

  const setName = useCallback(
    async (name: string) => {
      if (!token) throw new Error('Not signed in');
      const updated = await api.updateName(token, name.trim());
      // The server no longer accepts the token: back to sign-in
      if (!updated) return forget();
      setUser(updated);
    },
    [token, forget],
  );

  const signOut = useCallback(async () => {
    if (token) await api.signOut(token);
    await forget();
  }, [token, forget]);

  const value = useMemo(
    () => ({ status, user, token, requestCode, verify, setName, signOut, retry: restore }),
    [status, user, token, requestCode, verify, setName, signOut, restore],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
}
