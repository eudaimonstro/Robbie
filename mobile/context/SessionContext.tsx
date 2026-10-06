import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as api from '../lib/api';
import type { SessionUser } from '../lib/api';
import { getToken, removeToken, storeToken } from '../lib/storage';

type SessionStatus = 'loading' | 'signedIn' | 'signedOut';

interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  token: string | null;
  requestCode: (email: string) => Promise<void>;
  verify: (email: string, code: string) => Promise<SessionUser>;
  setName: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
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
    await removeToken();
    setToken(null);
    setUser(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    (async () => {
      const saved = await savedToken();
      if (!saved) return setStatus('signedOut');
      try {
        const me = await api.getMe(saved);
        if (!me) return forget();
        setToken(saved);
        setUser(me);
        setStatus('signedIn');
      } catch {
        // Offline at launch: keep the token and try again when the user acts
        setToken(saved);
        setStatus('signedOut');
      }
    })();
  }, [forget]);

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
      setUser(await api.updateName(token, name.trim()));
    },
    [token],
  );

  const signOut = useCallback(async () => {
    if (token) await api.signOut(token);
    await forget();
  }, [token, forget]);

  const value = useMemo(
    () => ({ status, user, token, requestCode, verify, setName, signOut }),
    [status, user, token, requestCode, verify, setName, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
}
