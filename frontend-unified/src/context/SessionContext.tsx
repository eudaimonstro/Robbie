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
import {
  auth,
  HttpError,
  setSignedOutHandler,
  setTermsHandler,
  type SessionUser,
} from '../api/client';

// 'unreachable': the session couldn't be checked (offline, or the server failed), so it is
// neither known to be signed in nor signed out
export type SessionStatus = 'loading' | 'signedIn' | 'signedOut' | 'unreachable';

interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  /** Whether the user accepted the current Terms of Service and Privacy Policy */
  termsAccepted: boolean;
  /** For a user without a name: the name given when they were added by email, to start from */
  suggestedName: string | null;
  requestCode: (email: string) => Promise<void>;
  verify: (email: string, code: string) => Promise<SessionUser>;
  setName: (name: string) => Promise<void>;
  /** Accept the current terms (the version this app shows) */
  acceptTerms: () => Promise<void>;
  /**
   * A request or the socket was refused until the terms are accepted: show the terms step.
   * Given when the request started, a refusal from before the terms were accepted is ignored.
   */
  markTermsNotAccepted: (startedAt?: number) => void;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  /** Check the session again after it was unreachable */
  retry: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const SIGN_OUT_FAILED = "Couldn't sign out. Check your connection and try again.";
const SESSION_EXPIRED = 'Your sign-in has expired. Sign in again.';

interface SessionState {
  user: SessionUser | null;
  termsAccepted: boolean;
  status: SessionStatus;
  suggestedName?: string | null;
}

const SIGNED_OUT: SessionState = { user: null, termsAccepted: false, status: 'signedOut' };

/** The session's user, terms acceptance and status, from the server */
async function checkSession(): Promise<SessionState> {
  try {
    const me = await auth.me();
    return me
      ? {
          user: me.user,
          termsAccepted: me.termsAccepted,
          status: 'signedIn',
          suggestedName: me.suggestedName ?? null,
        }
      : SIGNED_OUT;
  } catch {
    // Offline or a server error: the cookie may still be good, so don't send them to sign in
    return { user: null, termsAccepted: false, status: 'unreachable' };
  }
}

/** The signed-in user for the whole app. The session itself is an httpOnly cookie. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  // When the terms were last known to be accepted. A request refused before then, whose answer
  // arrives after, must not bring the terms step back.
  const acceptedAt = useRef(0);

  const apply = useCallback((state: SessionState) => {
    setUser(state.user);
    setTermsAccepted(state.termsAccepted);
    setSuggestedName(state.suggestedName ?? null);
    if (state.termsAccepted) acceptedAt.current = Date.now();
    setStatus(state.status);
  }, []);

  const markSignedOut = useCallback(() => apply(SIGNED_OUT), [apply]);
  const markTermsNotAccepted = useCallback((startedAt?: number) => {
    if (startedAt !== undefined && startedAt <= acceptedAt.current) return;
    setTermsAccepted(false);
  }, []);

  /** A 401 from an auth call means the session ended: show sign-in, and say so */
  const expiredOr = useCallback(
    (err: unknown): unknown => {
      if (err instanceof HttpError && err.status === 401) {
        markSignedOut();
        return new Error(SESSION_EXPIRED, { cause: err });
      }
      return err;
    },
    [markSignedOut],
  );

  useEffect(() => {
    let current = true;
    void checkSession().then((result) => {
      if (current) apply(result);
    });
    setSignedOutHandler(markSignedOut);
    setTermsHandler(markTermsNotAccepted);
    return () => {
      current = false;
      setSignedOutHandler(null);
      setTermsHandler(null);
    };
  }, [apply, markSignedOut, markTermsNotAccepted]);

  const retry = useCallback(async () => {
    setStatus('loading');
    apply(await checkSession());
  }, [apply]);

  // The challenge of this page's latest code request, by email: sent with the code, and with a
  // new request for the same email, so only this browser can use (or spend the guesses of) the
  // code it asked for
  const challenges = useRef(new Map<string, string>());

  const requestCode = useCallback(async (email: string) => {
    const key = email.trim().toLowerCase();
    const answer = await auth.requestCode(email, challenges.current.get(key));
    if (answer?.challenge) challenges.current.set(key, answer.challenge);
  }, []);

  const verify = useCallback(
    async (email: string, code: string) => {
      const challenge = challenges.current.get(email.trim().toLowerCase());
      const signedIn = await auth.verify(email, code, challenge);
      // The verify answer has only the user; whether they accepted the current terms comes from
      // me. If that check fails, ask for the terms: accepting again is harmless.
      const me = await auth.me().catch(() => null);
      apply({
        user: me?.user ?? signedIn,
        termsAccepted: me?.termsAccepted ?? false,
        status: 'signedIn',
        suggestedName: me?.suggestedName ?? null,
      });
      return signedIn;
    },
    [apply],
  );

  const setName = useCallback(
    async (name: string) => {
      try {
        setUser(await auth.updateName(name));
      } catch (err) {
        throw expiredOr(err);
      }
    },
    [expiredOr],
  );

  const acceptTerms = useCallback(async () => {
    try {
      await auth.acceptTerms();
      acceptedAt.current = Date.now();
      setTermsAccepted(true);
    } catch (err) {
      // A 409 says the terms changed since this page loaded; the message asks for a reload
      throw expiredOr(err);
    }
  }, [expiredOr]);

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
    () => ({
      status,
      user,
      termsAccepted,
      suggestedName,
      requestCode,
      verify,
      setName,
      acceptTerms,
      markTermsNotAccepted,
      signOut,
      signOutEverywhere,
      retry,
    }),
    [
      status,
      user,
      termsAccepted,
      suggestedName,
      requestCode,
      verify,
      setName,
      acceptTerms,
      markTermsNotAccepted,
      signOut,
      signOutEverywhere,
      retry,
    ],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
}
