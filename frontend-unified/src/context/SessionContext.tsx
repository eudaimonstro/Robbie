import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { auth, setSignedOutHandler, type SessionUser } from '../api/client';

type SessionStatus = 'loading' | 'signedIn' | 'signedOut';

interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  requestCode: (email: string) => Promise<void>;
  verify: (email: string, code: string) => Promise<SessionUser>;
  setName: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** The signed-in user for the whole app. The session itself is an httpOnly cookie. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');

  const markSignedOut = useCallback(() => {
    setUser(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    let current = true;
    auth
      .me()
      .then((me) => {
        if (!current) return;
        setUser(me);
        setStatus(me ? 'signedIn' : 'signedOut');
      })
      .catch(() => current && markSignedOut());
    setSignedOutHandler(markSignedOut);
    return () => {
      current = false;
      setSignedOutHandler(null);
    };
  }, [markSignedOut]);

  const requestCode = useCallback(async (email: string) => {
    await auth.requestCode(email);
  }, []);

  const verify = useCallback(async (email: string, code: string) => {
    const signedIn = await auth.verify(email, code);
    setUser(signedIn);
    setStatus('signedIn');
    return signedIn;
  }, []);

  const setName = useCallback(async (name: string) => {
    setUser(await auth.updateName(name));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await auth.signOut();
    } finally {
      markSignedOut();
    }
  }, [markSignedOut]);

  const signOutEverywhere = useCallback(async () => {
    await auth.signOutEverywhere();
    markSignedOut();
  }, [markSignedOut]);

  const value = useMemo(
    () => ({ status, user, requestCode, verify, setName, signOut, signOutEverywhere }),
    [status, user, requestCode, verify, setName, signOut, signOutEverywhere],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
}
