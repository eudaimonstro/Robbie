import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { auth, HttpError, setSignedOutHandler, type SessionUser } from '../api/client';

// 'unreachable': the session couldn't be checked (offline, or the server failed), so it is
// neither known to be signed in nor signed out
export type SessionStatus = 'loading' | 'signedIn' | 'signedOut' | 'unreachable';

interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  requestCode: (email: string) => Promise<void>;
  verify: (email: string, code: string) => Promise<SessionUser>;
  setName: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  /** Check the session again after it was unreachable */
  retry: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const SIGN_OUT_FAILED = "Couldn't sign out. Check your connection and try again.";

/** The session's user and status, from the server */
async function checkSession(): Promise<{ user: SessionUser | null; status: SessionStatus }> {
  try {
    const me = await auth.me();
    return { user: me, status: me ? 'signedIn' : 'signedOut' };
  } catch {
    // Offline or a server error: the cookie may still be good, so don't send them to sign in
    return { user: null, status: 'unreachable' };
  }
}

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
    void checkSession().then((result) => {
      if (!current) return;
      setUser(result.user);
      setStatus(result.status);
    });
    setSignedOutHandler(markSignedOut);
    return () => {
      current = false;
      setSignedOutHandler(null);
    };
  }, [markSignedOut]);

  const retry = useCallback(async () => {
    setStatus('loading');
    const result = await checkSession();
    setUser(result.user);
    setStatus(result.status);
  }, []);

  const requestCode = useCallback(async (email: string) => {
    await auth.requestCode(email);
  }, []);

  const verify = useCallback(async (email: string, code: string) => {
    const signedIn = await auth.verify(email, code);
    setUser(signedIn);
    setStatus('signedIn');
    return signedIn;
  }, []);

  const setName = useCallback(
    async (name: string) => {
      try {
        setUser(await auth.updateName(name));
      } catch (err) {
        if (err instanceof HttpError && err.status === 401) {
          markSignedOut();
          throw new Error('Your sign-in has expired. Sign in again.', { cause: err });
        }
        throw err;
      }
    },
    [markSignedOut],
  );

  const signOut = useCallback(async () => {
    try {
      await auth.signOut();
    } catch (err) {
      // Only a 401 (the session had already ended) confirms it. A network failure, or a 502
      // from the proxy that never reached the server, leaves the cookie and session in place:
      // showing signed out would leave the next person at this computer signed in as this user.
      // A 500 that did clear the cookie is harmless, since a retry then succeeds.
      if (!(err instanceof HttpError && err.status === 401)) {
        throw new Error(SIGN_OUT_FAILED, { cause: err });
      }
    }
    markSignedOut();
  }, [markSignedOut]);

  const signOutEverywhere = useCallback(async () => {
    try {
      await auth.signOutEverywhere();
    } catch (err) {
      // A 401 means this session had already ended. Any other failure may have left the
      // cookie in place, since this route clears it only after ending the sessions.
      if (!(err instanceof HttpError)) throw new Error(SIGN_OUT_FAILED, { cause: err });
      if (err.status !== 401) throw err;
    }
    markSignedOut();
  }, [markSignedOut]);

  const value = useMemo(
    () => ({ status, user, requestCode, verify, setName, signOut, signOutEverywhere, retry }),
    [status, user, requestCode, verify, setName, signOut, signOutEverywhere, retry],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
}
