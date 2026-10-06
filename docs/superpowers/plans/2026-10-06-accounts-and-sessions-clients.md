# Accounts and Sessions (Clients) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the web and mobile apps from per-meeting sign-in to the new app-wide sessions: sign in once by emailed code, set a display name, then use documents and join meetings by code.

**Architecture:**

- **Web.**
  - A `SessionProvider` holds the signed-in user, loaded from `GET /api/auth/me`, since the session cookie is httpOnly and can't be read by script.
  - A `/sign-in` page runs the email, code and name steps.
  - A route guard sends signed-out users there, and the API client reports any 401 to the provider.
  - The meetings module stops doing its own sign-in. It keeps only the meeting code, and its socket connects with the cookie.
- **Mobile.**
  - The session token lives in `expo-secure-store` and is restored on launch.
  - A session context runs sign-in, and the socket sends the token in its handshake.
  - Joining asks only for the meeting code.

**Tech Stack:** React 19, React Router 7, Vite 8, Vitest 5 with Testing Library (web); Expo SDK 57, expo-router, jest-expo, `@testing-library/react-native` (mobile).

**Design:** `docs/superpowers/specs/2026-10-06-accounts-and-sessions-design.md`. The server side is done on this branch (`docs/superpowers/plans/2026-10-06-accounts-and-sessions-server.md`).

**Server API this plan uses:**

| Call                                 | Body                                          | Answer                                                                                                                              |
| ------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/request-code`        | `{ email }`                                   | `{ success: true }`; errors 400, 429, 502 as `{ error: string }`                                                                    |
| `POST /api/auth/verify`              | `{ email, code, client?: 'web' \| 'mobile' }` | `{ user }`. Web gets the `session` cookie. Mobile gets `{ user, token }`. Errors: 400, 401 "That code is wrong or has expired", 429 |
| `GET /api/auth/me`                   |                                               | `{ user }` or 401                                                                                                                   |
| `PATCH /api/auth/me`                 | `{ name }` (2 to 100 characters)              | `{ user }`; a bad name is a 400 with `{ error: { code, message, details } }`                                                        |
| `POST /api/auth/sign-out`            |                                               | 200, and the cookie is cleared                                                                                                      |
| `POST /api/auth/sign-out-everywhere` |                                               | 200 (needs a session)                                                                                                               |

- `user` is `{ id: number, email: string, name: string \| null }`. A null name means the client must ask for one.
- Any other `/api` route answers 401 `{ error: 'Not signed in' }` without a session.
- Sockets need the cookie (web, with `withCredentials: true`) or `auth: { token }` (mobile). Without one the connection fails with `connect_error` "Not signed in".
- `JOIN_MEETING` takes `{ meetingCode }` only.

**Conventions:**

- Use `&&` between shell commands, never `;`.
- Web tests: `TZ=America/Chicago npx vitest run` in `frontend-unified`. Mobile tests: `npx jest` in `mobile`.
- Commit messages carry no `Co-Authored-By` lines.
- Never point anything at port 5432. For a live server, use the throwaway Postgres on 55432 with `ENABLE_TEST_AUTH=true` (the code `000000` signs in any email).

---

## File structure

**Web** (`frontend-unified/src`):

| File                                       | Responsibility                                                     |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `api/client.ts`                            | Add `auth` calls and a signed-out handler for 401s                 |
| `context/SessionContext.tsx`               | `SessionProvider`, `useSession`                                    |
| `pages/SignInPage.tsx`                     | Email, code, then name                                             |
| `components/auth/RequireSession.tsx`       | Route guard                                                        |
| `components/layout/UserMenu.tsx`           | Name, Settings, sign-out in the header                             |
| `App.tsx`                                  | Providers and routes                                               |
| `modules/documents/pages/SettingsPage.tsx` | "Your name" card                                                   |
| `modules/meetings/...`                     | Drop `useAuth`/`AuthScreen`; add `JoinMeetingScreen`; join by code |

**Mobile** (`mobile`):

| File                                             | Responsibility                                                |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `lib/storage.ts`                                 | Session token in `expo-secure-store`; current meeting code    |
| `lib/api.ts`                                     | `requestCode`, `verifyCode`, `getMe`, `updateName`, `signOut` |
| `context/SessionContext.tsx`                     | Restore on launch, sign-in steps, sign-out                    |
| `context/SocketContext.tsx`                      | Meeting connection only (no auth)                             |
| `app/_layout.tsx`                                | Providers and redirects                                       |
| `app/(auth)/login.tsx`, `verify.tsx`, `name.tsx` | Sign-in steps                                                 |
| `app/(meeting)/join.tsx`                         | Enter a meeting code                                          |

---

### Task 1: API client sign-in calls and 401 handling (web)

**Files:**

- Modify: `frontend-unified/src/api/client.ts`
- Test: `frontend-unified/src/api/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `client.test.ts`)

```ts
describe('sign-in calls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setSignedOutHandler(null);
  });

  it('returns the signed-in user, or null when signed out', async () => {
    mockResponse(200, { user: { id: 1, email: 'ann@example.org', name: 'Ann' } });
    expect(await auth.me()).toEqual({ id: 1, email: 'ann@example.org', name: 'Ann' });
    mockResponse(401, { error: 'Not signed in' });
    expect(await auth.me()).toBeNull();
  });

  it('verifies a code for the web client', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ user: { id: 1, email: 'a@b.c', name: null } })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await auth.verify('a@b.c', '123456');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b.c', code: '123456' });
  });

  it('reports a 401 from any other call as signed out', async () => {
    const onSignedOut = vi.fn();
    setSignedOutHandler(onSignedOut);
    mockResponse(401, { error: 'Not signed in' });
    await expect(organizations.list()).rejects.toThrow('Not signed in');
    expect(onSignedOut).toHaveBeenCalledOnce();
  });

  it('never retries a sign-in call', async () => {
    // A retried code request would send another email and count against the limit
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ error: 'Too many codes' }), { status: 429 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(auth.requestCode('a@b.c')).rejects.toThrow('Too many codes');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not report a wrong sign-in code as signed out', async () => {
    const onSignedOut = vi.fn();
    setSignedOutHandler(onSignedOut);
    mockResponse(401, { error: 'That code is wrong or has expired' });
    await expect(auth.verify('a@b.c', '000001')).rejects.toThrow('That code is wrong');
    expect(onSignedOut).not.toHaveBeenCalled();
  });
});
```

Add `auth` and `setSignedOutHandler` to the test file's import from `'../client'`.

- [ ] **Step 2: Run it to see it fail**

Run: `TZ=America/Chicago npx vitest run src/api` (in `frontend-unified`)
Expected: FAIL, `auth` and `setSignedOutHandler` are not exported.

- [ ] **Step 3: Implement in `client.ts`**

Near the top, after the cache helpers:

```ts
// Called when a request answers 401 (the session has ended), so the app can show sign-in.
// Calls under /auth/ are excluded: a 401 there is an answer (a wrong code, or "not signed in"
// from /auth/me), not a lost session.
let signedOutHandler: (() => void) | null = null;

export function setSignedOutHandler(handler: (() => void) | null): void {
  signedOutHandler = handler;
}
```

In `request()`, inside `if (!response.ok) {`, before the retry check:

```ts
if (response.status === 401 && !endpoint.startsWith('/auth/')) {
  cache.clear();
  signedOutHandler?.();
}
```

At the end of the file, add the sign-in calls and their types:

```ts
export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
}

export const auth = {
  /** The signed-in user, or null when there is no session */
  me: async (): Promise<SessionUser | null> => {
    const response = await fetch(`${API_BASE}/auth/me`, { credentials: 'same-origin' });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(await errorMessage(response));
    return ((await response.json()) as { user: SessionUser }).user;
  },
  requestCode: (email: string) =>
    request<{ success: boolean }>(
      '/auth/request-code',
      { method: 'POST', body: JSON.stringify({ email }) },
      false,
    ),
  verify: async (email: string, code: string) =>
    (
      await request<{ user: SessionUser }>(
        '/auth/verify',
        { method: 'POST', body: JSON.stringify({ email, code }) },
        false,
      )
    ).user,
  updateName: async (name: string) =>
    (
      await request<{ user: SessionUser }>(
        '/auth/me',
        { method: 'PATCH', body: JSON.stringify({ name }) },
        false,
      )
    ).user,
  signOut: () => request<{ success: boolean }>('/auth/sign-out', { method: 'POST' }, false),
  signOutEverywhere: () =>
    request<{ success: boolean }>('/auth/sign-out-everywhere', { method: 'POST' }, false),
};
```

`errorMessage(response)` is the existing helper that `request()` uses. If its name differs, use the existing one.

Sign-in calls must never be retried. `shouldRetry` retries 429 and 5xx, so a retried code request would send another email and count against the 5-per-hour limit. In `request()`, skip the retry for `/auth/` endpoints:

```ts
        if (!endpoint.startsWith('/auth/') && shouldRetry(response.status, attempt)) {
```

(This replaces the existing `if (shouldRetry(response.status, attempt)) {` line.) Do the same in the network-error retry inside the `catch`: add `!endpoint.startsWith('/auth/') &&` to its condition.

The "never retries a sign-in call" test in Step 1 covers this.

A successful sign-out also clears the cache; the mutation path already does this.

- [ ] **Step 4: Run it to see it pass**

Run: `TZ=America/Chicago npx vitest run src/api && npx tsc --noEmit -p .`
Expected: all pass, type-check clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts src/api/__tests__/client.test.ts
git commit -m "feat(web): add sign-in calls and report lost sessions from the API client"
```

---

### Task 2: Session provider (web)

**Files:**

- Create: `frontend-unified/src/context/SessionContext.tsx`
- Test: `frontend-unified/src/context/__tests__/SessionContext.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const client = vi.hoisted(() => ({
  me: vi.fn(),
  verify: vi.fn(),
  updateName: vi.fn(),
  signOut: vi.fn(async () => ({ success: true })),
  signOutEverywhere: vi.fn(async () => ({ success: true })),
  requestCode: vi.fn(async () => ({ success: true })),
  handler: null as null | (() => void),
}));
vi.mock('../../api/client', () => ({
  auth: client,
  setSignedOutHandler: (h: (() => void) | null) => {
    client.handler = h;
  },
}));

const { SessionProvider, useSession } = await import('../SessionContext');
const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);
const ann = { id: 1, email: 'ann@example.org', name: 'Ann' };

describe('SessionProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the signed-in user', async () => {
    client.me.mockResolvedValueOnce(ann);
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.user).toEqual(ann);
  });

  it('is signed out without a session', async () => {
    client.me.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
  });

  it('signs in, names the user and signs out', async () => {
    client.me.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    client.verify.mockResolvedValueOnce({ ...ann, name: null });
    await act(() => result.current.verify('ann@example.org', '123456'));
    expect(result.current.user?.name).toBeNull();

    client.updateName.mockResolvedValueOnce(ann);
    await act(() => result.current.setName('Ann'));
    expect(result.current.user).toEqual(ann);

    await act(() => result.current.signOut());
    expect(client.signOut).toHaveBeenCalled();
    expect(result.current.status).toBe('signedOut');
  });

  it('becomes signed out when the API reports a lost session', async () => {
    client.me.mockResolvedValueOnce(ann);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    act(() => client.handler?.());
    expect(result.current.status).toBe('signedOut');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `TZ=America/Chicago npx vitest run src/context/__tests__/SessionContext.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `context/SessionContext.tsx`**

```tsx
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
```

- [ ] **Step 4: Run it to see it pass**

Run: `TZ=America/Chicago npx vitest run src/context && npx tsc --noEmit -p .`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/context/SessionContext.tsx src/context/__tests__/SessionContext.test.tsx
git commit -m "feat(web): add a session provider for the signed-in user"
```

---

### Task 3: Sign-in page (web)

**Files:**

- Create: `frontend-unified/src/pages/SignInPage.tsx`
- Test: `frontend-unified/src/pages/__tests__/SignInPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const session = vi.hoisted(() => ({
  status: 'signedOut' as 'signedOut' | 'signedIn',
  user: null as null | { id: number; email: string; name: string | null },
  requestCode: vi.fn(async () => {}),
  verify: vi.fn(),
  setName: vi.fn(async () => {}),
}));
vi.mock('../../context/SessionContext', () => ({ useSession: () => session }));

const { default: SignInPage } = await import('../SignInPage');

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/documents/d1" element={<p>Document page</p>} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SignInPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.status = 'signedOut';
    session.user = null;
  });

  it('signs in with an emailed code and returns to the page asked for', async () => {
    session.verify.mockImplementation(async () => {
      session.status = 'signedIn';
      session.user = { id: 1, email: 'ann@example.org', name: 'Ann' };
      return session.user;
    });
    renderAt('/sign-in?next=%2Fdocuments%2Fd1');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ann@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await waitFor(() => expect(session.requestCode).toHaveBeenCalledWith('ann@example.org'));

    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.queryByText('Document page')).not.toBeNull());
    expect(session.verify).toHaveBeenCalledWith('ann@example.org', '123456');
  });

  it('asks a new user for a name before going on', async () => {
    session.verify.mockImplementation(async () => {
      session.status = 'signedIn';
      session.user = { id: 1, email: 'ann@example.org', name: null };
      return session.user;
    });
    renderAt('/sign-in');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ann@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Ann' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(session.setName).toHaveBeenCalledWith('Ann'));
  });

  it("shows the server's message for a wrong code", async () => {
    session.verify.mockRejectedValue(new Error('That code is wrong or has expired'));
    renderAt('/sign-in');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ann@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '000001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('That code is wrong or has expired')).toBeTruthy();
  });

  it('ignores a next address that leaves the app', async () => {
    session.status = 'signedIn';
    session.user = { id: 1, email: 'ann@example.org', name: 'Ann' };
    renderAt('/sign-in?next=https%3A%2F%2Fevil.example');
    expect(await screen.findByText('Home')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `TZ=America/Chicago npx vitest run src/pages`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `pages/SignInPage.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { useSession } from '../context/SessionContext';

/** Where to go after signing in: a path inside the app, never another site */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.';

export default function SignInPage() {
  const { status, user, requestCode, verify, setName } = useSession();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setNameInput] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed in with a name: go on to the page asked for
  if (status === 'signedIn' && user?.name) return <Navigate to={next} replace />;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const onSendCode = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await requestCode(email.trim());
      setCodeSent(true);
    });
  };
  const onVerify = (e: FormEvent) => {
    e.preventDefault();
    run(() => verify(email.trim(), code.trim()));
  };
  const onName = (e: FormEvent) => {
    e.preventDefault();
    run(() => setName(name.trim()));
  };

  const step = status === 'signedIn' ? 'name' : codeSent ? 'code' : 'email';

  return (
    <main className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-900 p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <Scale className="w-6 h-6 text-primary-600" aria-hidden="true" />
          <h1 className="text-xl font-heading font-bold text-secondary-900 dark:text-white">
            {step === 'name' ? 'Welcome' : 'Sign in to Robbie'}
          </h1>
        </div>

        {step === 'email' && (
          <form onSubmit={onSendCode} className="space-y-4">
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              Send code
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={onVerify} className="space-y-4">
            <p className="text-sm text-secondary-600 dark:text-secondary-400">
              We sent a 6-digit code to {email.trim()}. It works for 15 minutes.
            </p>
            <div>
              <label htmlFor="code" className="label">
                Code
              </label>
              <input
                id="code"
                className="input tracking-widest"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              Sign in
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                setCodeSent(false);
                setCode('');
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        {step === 'name' && (
          <form onSubmit={onName} className="space-y-4">
            <p className="text-sm text-secondary-600 dark:text-secondary-400">
              What should others see in meetings?
            </p>
            <div>
              <label htmlFor="name" className="label">
                Your name
              </label>
              <input
                id="name"
                className="input"
                autoComplete="name"
                minLength={2}
                maxLength={100}
                required
                value={name}
                onChange={(e) => setNameInput(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              Continue
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger-600 dark:text-danger-400">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `TZ=America/Chicago npx vitest run src/pages && npx tsc --noEmit -p .`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pages
git commit -m "feat(web): add the sign-in page (email, code, then name)"
```

---

### Task 4: Route guard, providers and the user menu (web)

**Files:**

- Create: `frontend-unified/src/components/auth/RequireSession.tsx`, `frontend-unified/src/components/layout/UserMenu.tsx`
- Modify: `frontend-unified/src/App.tsx`, `frontend-unified/src/components/layout/Header.tsx`, `frontend-unified/src/modules/documents/pages/SettingsPage.tsx`
- Test: `frontend-unified/src/components/auth/__tests__/RequireSession.test.tsx`, `frontend-unified/src/components/layout/__tests__/UserMenu.test.tsx`

- [ ] **Step 1: Write the failing tests**

`components/auth/__tests__/RequireSession.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const session = vi.hoisted(() => ({
  status: 'signedOut' as 'loading' | 'signedIn' | 'signedOut',
  user: null as null | { id: number; email: string; name: string | null },
}));
vi.mock('../../../context/SessionContext', () => ({ useSession: () => session }));

const { RequireSession } = await import('../RequireSession');

function SignInSpy() {
  const location = useLocation();
  return <p>sign-in {location.search}</p>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sign-in" element={<SignInSpy />} />
        <Route
          path="/documents/:id"
          element={
            <RequireSession>
              <p>Document page</p>
            </RequireSession>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireSession', () => {
  it('sends a signed-out user to sign in, remembering the page', () => {
    session.status = 'signedOut';
    renderAt('/documents/d1?tab=history');
    expect(screen.getByText('sign-in ?next=%2Fdocuments%2Fd1%3Ftab%3Dhistory')).toBeTruthy();
  });

  it('sends a signed-in user without a name to finish signing in', () => {
    session.status = 'signedIn';
    session.user = { id: 1, email: 'a@b.c', name: null };
    renderAt('/documents/d1');
    expect(screen.getByText(/^sign-in/)).toBeTruthy();
  });

  it('shows the page to a signed-in user with a name', () => {
    session.status = 'signedIn';
    session.user = { id: 1, email: 'a@b.c', name: 'Ann' };
    renderAt('/documents/d1');
    expect(screen.getByText('Document page')).toBeTruthy();
  });

  it('shows nothing from the page while the session loads', () => {
    session.status = 'loading';
    renderAt('/documents/d1');
    expect(screen.queryByText('Document page')).toBeNull();
    expect(screen.queryByText(/^sign-in/)).toBeNull();
  });
});
```

`components/layout/__tests__/UserMenu.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const session = vi.hoisted(() => ({
  user: { id: 1, email: 'ann@example.org', name: 'Ann Chair' },
  signOut: vi.fn(async () => {}),
  signOutEverywhere: vi.fn(async () => {}),
}));
vi.mock('../../../context/SessionContext', () => ({ useSession: () => session }));

const { UserMenu } = await import('../UserMenu');

describe('UserMenu', () => {
  it('shows the user and signs out', async () => {
    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ann Chair/ }));
    expect(screen.getByText('ann@example.org')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(session.signOut).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `TZ=America/Chicago npx vitest run src/components`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `components/auth/RequireSession.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../../context/SessionContext';
import { LoadingPage } from '../ui/LoadingSpinner';

/** Show the children only to a signed-in user with a name; send anyone else to sign in */
export function RequireSession({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const location = useLocation();

  if (status === 'loading') return <LoadingPage />;
  if (status === 'signedOut' || !user?.name) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: Implement `components/layout/UserMenu.tsx`**

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, Settings, UserCircle } from 'lucide-react';
import { useSession } from '../../context/SessionContext';

/** The signed-in user's name, with Settings and sign-out */
export function UserMenu() {
  const { user, signOut, signOutEverywhere } = useSession();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-secondary-50 dark:hover:bg-secondary-700"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <UserCircle className="w-5 h-5 text-secondary-500" aria-hidden="true" />
        <span className="hidden sm:inline text-secondary-700 dark:text-secondary-200">
          {user.name}
        </span>
        <ChevronDown className="w-4 h-4 text-secondary-400" aria-hidden="true" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 mt-1 w-56 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg shadow-lg z-20 py-1"
          >
            <p className="px-4 py-2 text-xs text-secondary-500 truncate">{user.email}</p>
            <Link
              role="menuitem"
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-secondary-50 dark:hover:bg-secondary-700"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              Settings
            </Link>
            <button
              role="menuitem"
              onClick={() => signOut()}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Sign out
            </button>
            <button
              role="menuitem"
              onClick={() => signOutEverywhere()}
              className="w-full px-4 py-2 text-sm text-left text-secondary-600 dark:text-secondary-400 hover:bg-secondary-50 dark:hover:bg-secondary-700"
            >
              Sign out on all devices
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire up `App.tsx`**

- Wrap the app in `SessionProvider` (inside `ToastProvider`).
- Remove `OrganizationProvider` from around the whole app. It fetches organizations, which needs a session, so it moves inside the guarded layout route.
- Add the public `/sign-in` route.

```tsx
import { SessionProvider } from './context/SessionContext';
import { RequireSession } from './components/auth/RequireSession';
const SignInPage = lazy(() => import('./pages/SignInPage'));
```

```tsx
<ThemeProvider>
  <ToastProvider>
    <SessionProvider>
      <ErrorBoundary>
        <RouteAnnouncer />
        <Suspense fallback={<LoadingPage />}>
          <Routes>
            {/* Public routes (no layout, no session) */}
            <Route path="/share/:shareToken" element={<PublicDocumentPage />} />
            <Route path="/sign-in" element={<SignInPage />} />

            {/* Everything else needs a signed-in user */}
            <Route
              element={
                <RequireSession>
                  <OrganizationProvider>
                    <AppLayout>
                      <Outlet />
                    </AppLayout>
                  </OrganizationProvider>
                </RequireSession>
              }
            >
              {/* existing child routes, unchanged */}
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </SessionProvider>
  </ToastProvider>
</ThemeProvider>
```

- [ ] **Step 6: Add the menu to the header**

In `components/layout/Header.tsx`, render `<UserMenu />` (imported from `./UserMenu`) as the last child of the right-hand `<div className="flex items-center gap-4">`, after the organization switcher.

- [ ] **Step 7: Add "Your name" to Settings**

In `modules/documents/pages/SettingsPage.tsx`, add a first card above the organization cards. Follow the existing cards' markup (`card`, heading, `label`/`input`, `btn-primary`).

```tsx
const { user, setName } = useSession();
const [displayName, setDisplayName] = useState(user?.name ?? '');
const [savingName, setSavingName] = useState(false);

const handleSaveName = async (e: React.FormEvent) => {
  e.preventDefault();
  try {
    setSavingName(true);
    await setName(displayName.trim());
    showToast('success', 'Name updated');
  } catch (err) {
    showToast('error', err instanceof Error ? err.message : 'Failed to update your name');
  } finally {
    setSavingName(false);
  }
};
```

The card contains:

- a form with the label "Your name" (`htmlFor="displayName"`) and an input (`id="displayName"`, `minLength={2}`, `maxLength={100}`, required);
- the help text "Shown to others in meetings.";
- a Save button, disabled while saving or when the trimmed value equals `user?.name`.

`showToast` is the page's existing toast hook; check its name in the file.

- [ ] **Step 8: Run all web tests and type-check**

Run: `TZ=America/Chicago npx vitest run && npx tsc --noEmit -p .`
Expected: all pass. If an existing test renders `App` or relies on `OrganizationProvider` being at the root, wrap it in `SessionProvider` with a mocked `auth.me`. Don't loosen what it asserts.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/components src/modules/documents/pages/SettingsPage.tsx
git commit -m "feat(web): require sign-in for the app, with a user menu and name setting"
```

---

### Task 5: Meetings join by code (web)

**Files:**

- Delete: `frontend-unified/src/modules/meetings/hooks/useAuth.ts`, `frontend-unified/src/modules/meetings/views/AuthScreen.tsx`
- Create: `frontend-unified/src/modules/meetings/views/JoinMeetingScreen.tsx`
- Modify:
  - `frontend-unified/src/modules/meetings/context/SocketContext.tsx`
  - `frontend-unified/src/modules/meetings/hooks/useSocketConnection.ts`
  - `frontend-unified/src/modules/meetings/types/socket.ts`
  - `frontend-unified/src/modules/meetings/index.tsx`
- Tests: update `context/__tests__/SocketContext.test.tsx`, `hooks/__tests__/useSocketConnection.test.ts` and `__tests__/MeetingsModule.test.tsx`; add `views/__tests__/JoinMeetingScreen.test.tsx`

**Behavior:**

- The meetings module no longer signs anyone in. The user comes from `useSession()`.
- The module keeps the current meeting code in state, persisted in `localStorage` under `robbie_meeting_code` (wrapped in try/catch), so a reload rejoins.
- `joinMeeting(code)` sets the code (uppercased and trimmed); the socket connects and emits `JOIN_MEETING { meetingCode }`.
- `leaveMeeting()` emits `LEAVE_MEETING`, disconnects and clears the code. This is what "Leave meeting" does now; it no longer signs out.
- A socket `connect_error` with message "Not signed in" means the session ended. The browser goes to `/sign-in?next=%2Fmeetings` with a full page load, so the session reloads from the server.
- `currentUser` is the member with the session user's id, or `{ id, name, role: 'member', present: true }` from the session user before the first state arrives.

- [ ] **Step 1: Update types** (`types/socket.ts`)

- In `ClientToServerEvents`, `JOIN_MEETING`'s data becomes `{ meetingCode: string }`.
- Delete the `AuthState` interface.
- In `SocketContextValue`:
  - replace `isAuthenticated`, `currentUserEmail`, `login`, `verifyCode` and `logout` with `meetingCode: string | null`, `joinMeeting: (code: string) => void` and `leaveMeeting: () => void`;
  - keep `state`, `dispatch`, `isConnected`, `currentUser`, `connectedMembers`, `error` and `reconnect`.

- [ ] **Step 2: Write the failing tests**

`views/__tests__/JoinMeetingScreen.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const socket = vi.hoisted(() => ({ joinMeeting: vi.fn(), error: null as string | null }));
vi.mock('../../context/SocketContext', () => ({ useSocket: () => socket }));
vi.mock('../../components/scheduling', () => ({ MeetingScheduler: () => <p>Scheduler</p> }));

const { JoinMeetingScreen } = await import('../JoinMeetingScreen');

describe('JoinMeetingScreen', () => {
  it('joins by meeting code', () => {
    render(<JoinMeetingScreen />);
    fireEvent.change(screen.getByLabelText('Meeting code'), { target: { value: ' sync02 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join meeting' }));
    expect(socket.joinMeeting).toHaveBeenCalledWith('SYNC02');
  });

  it('rejects a code that is not 4 to 8 letters or digits', () => {
    render(<JoinMeetingScreen />);
    fireEvent.change(screen.getByLabelText('Meeting code'), { target: { value: 'ab!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join meeting' }));
    expect(socket.joinMeeting).not.toHaveBeenCalled();
    expect(screen.getByText('Meeting codes are 4 to 8 letters or digits')).toBeTruthy();
  });
});
```

In `hooks/__tests__/useSocketConnection.test.ts`:

- call the hook as `useSocketConnection(meetingCode, onNotSignedIn)` instead of passing an `AuthState` and token;
- assert the `JOIN_MEETING` payload is exactly `{ meetingCode: 'DEMO' }`;
- add a test that a `connect_error` with message "Not signed in" calls `onNotSignedIn`;
- keep the existing tests: one socket per meeting, out-of-order updates ignored, no timeout after an ack.

`context/__tests__/SocketContext.test.tsx`: mock `../../../../context/SessionContext` to return a signed-in user. Then render the provider, call `joinMeeting('DEMO')`, and assert a single socket joins with `{ meetingCode: 'DEMO' }`.

`__tests__/MeetingsModule.test.tsx`: the fake socket context now has `meetingCode`, `joinMeeting` and `leaveMeeting` instead of `isAuthenticated` and `logout`. "Leave meeting" calls `leaveMeeting`. With no `meetingCode`, the join screen shows.

- [ ] **Step 3: Run them to see them fail**

Run: `TZ=America/Chicago npx vitest run src/modules/meetings`
Expected: failures for the new behavior.

- [ ] **Step 4: Implement `views/JoinMeetingScreen.tsx`**

Base it on the join part of the old `AuthScreen.tsx`: same card layout, same icon, and the same "Schedule a New Meeting" button showing `MeetingScheduler`. But keep only the meeting-code field.

```tsx
import { useState, type FormEvent } from 'react';
import { Calendar, Gavel, Hash } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { MeetingScheduler } from '../components/scheduling';

const MEETING_CODE = /^[A-Z0-9]{4,8}$/;

/** Join a live meeting by its code, or schedule a new one */
export function JoinMeetingScreen() {
  const { joinMeeting, error } = useSocket();
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  if (scheduling) {
    return (
      <MeetingScheduler onBack={() => setScheduling(false)} onJoinMeeting={(c) => joinMeeting(c)} />
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!MEETING_CODE.test(normalized)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    joinMeeting(normalized);
  };

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-6">
          <Gavel className="w-6 h-6 text-meeting-600" aria-hidden="true" />
          <h2 className="text-xl font-heading font-bold text-secondary-900 dark:text-white">
            Join a Meeting
          </h2>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="meetingCode" className="label">
              Meeting code
            </label>
            <div className="relative">
              <Hash
                className="w-4 h-4 absolute left-3 top-3 text-secondary-400"
                aria-hidden="true"
              />
              <input
                id="meetingCode"
                className="input pl-9 uppercase tracking-widest"
                autoComplete="off"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            {invalid && (
              <p role="alert" className="mt-1 text-sm text-danger-600">
                Meeting codes are 4 to 8 letters or digits
              </p>
            )}
          </div>
          <button type="submit" className="btn-primary w-full">
            Join meeting
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger-600">
            {error}
          </p>
        )}
        <div className="mt-6 pt-6 border-t border-secondary-200 dark:border-secondary-700">
          <button onClick={() => setScheduling(true)} className="btn-secondary w-full">
            <Calendar className="w-4 h-4 mr-2" aria-hidden="true" />
            Schedule a New Meeting
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Change `hooks/useSocketConnection.ts`**

- Signature: `useSocketConnection(meetingCode: string | null, onNotSignedIn: () => void)`. Store `onNotSignedIn` in a ref, as `onInvalidToken` is now.
- The connection effect returns early when `!meetingCode`, and its dependency list becomes `[meetingCode, setTemporaryError]`.
- Emit `JOIN_MEETING` with `{ meetingCode }`.
- Remove the "Invalid token" branch. Add:

```ts
newSocket.on('connect_error', (err) => {
  isConnectingRef.current = false;
  if (err.message === 'Not signed in') {
    onNotSignedInRef.current();
    return;
  }
  setError(`Connection error: ${err.message}`);
});
```

This replaces the existing `connect_error` handler.

- Keep everything else unchanged: the state version ref, the dispatch timeout, `reconnect` and `disconnect`.

- [ ] **Step 6: Change `context/SocketContext.tsx`**

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Member } from '@robbie-bylawyer/shared/types';
import type { SocketContextValue } from '../types/socket';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { useSession } from '../../../context/SessionContext';

const SocketContext = createContext<SocketContextValue | null>(null);
const MEETING_KEY = 'robbie_meeting_code';

function savedMeetingCode(): string | null {
  try {
    return localStorage.getItem(MEETING_KEY);
  } catch {
    return null;
  }
}

function saveMeetingCode(code: string | null) {
  try {
    if (code) localStorage.setItem(MEETING_KEY, code);
    else localStorage.removeItem(MEETING_KEY);
  } catch {
    // Storage may be unavailable; the meeting just isn't remembered across reloads
  }
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [meetingCode, setMeetingCode] = useState<string | null>(savedMeetingCode);

  // The session ended (signed out elsewhere, or expired): go to sign-in and come back here
  const handleNotSignedIn = useCallback(() => {
    window.location.assign('/sign-in?next=%2Fmeetings');
  }, []);

  const connection = useSocketConnection(meetingCode, handleNotSignedIn);

  const joinMeeting = useCallback((code: string) => {
    const normalized = code.trim().toUpperCase();
    saveMeetingCode(normalized);
    setMeetingCode(normalized);
  }, []);

  const { disconnect } = connection;
  const leaveMeeting = useCallback(() => {
    disconnect();
    saveMeetingCode(null);
    setMeetingCode(null);
  }, [disconnect]);

  const currentUser = useMemo<Member | null>(() => {
    if (!user) return null;
    return (
      connection.state.members.find((m) => m.id === user.id) ?? {
        id: user.id,
        name: user.name ?? user.email,
        role: 'member',
        present: true,
      }
    );
  }, [user, connection.state.members]);

  const value = useMemo<SocketContextValue>(
    () => ({
      state: connection.state,
      dispatch: connection.dispatch,
      isConnected: connection.isConnected,
      currentUser,
      connectedMembers: connection.connectedMembers,
      error: connection.error,
      meetingCode,
      joinMeeting,
      leaveMeeting,
      reconnect: connection.reconnect,
    }),
    [connection, currentUser, meetingCode, joinMeeting, leaveMeeting],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
}
```

Check the shape `disconnect` has in `useSocketConnection` (it emits `LEAVE_MEETING` and disconnects), and keep using it.

- [ ] **Step 7: Change `index.tsx`**

`MeetingsContent` uses `const { meetingCode, isConnected, error, reconnect, leaveMeeting } = useSocket();`:

- no `meetingCode`: render `<JoinMeetingScreen />` (instead of `AuthScreen`);
- a meeting code but not connected: the existing connecting screen, with its "Leave meeting" button calling `leaveMeeting`;
- connected: `<MeetingApp />`.

In `views/MeetingApp.tsx` and `components/ConnectionStatus.tsx`, any "Leave"/"Logout" control that called `logout` now calls `leaveMeeting` and is labeled "Leave meeting". Signing out lives in the header's user menu.

Delete `hooks/useAuth.ts` and `views/AuthScreen.tsx`. Remove `validateEmail`, `validateName` and `validateVerificationCode` from `utils/validators.ts` only if nothing else uses them (check with grep).

- [ ] **Step 8: Run everything**

Run: `TZ=America/Chicago npx vitest run && npx tsc --noEmit -p . && npx eslint src`
Expected: all pass. Run `grep -rn "useAuth\|AuthScreen\|request-verification\|robbie_auth\|currentUserEmail" src`; it should print nothing.

- [ ] **Step 9: Commit**

```bash
git add -A src/modules/meetings src/utils
git commit -m "feat(web): join meetings by code with the app session

The meetings module no longer signs people in: it uses the app's
session, keeps only the current meeting code (remembered across reloads)
and connects with the session cookie. Leave meeting leaves the meeting;
signing out is in the user menu."
```

---

### Task 6: Live check in a browser (web)

**Files:** none (verification only).

- [ ] **Step 1: Start the server and the web app**

- Backend: from `backend-node`, run `npm run build`, then `node dist/index.js` in the background with these environment variables:
  - `DATABASE_URL` and `DIRECT_URL` set to `postgresql://postgres:postgres@localhost:55432/robbie`;
  - `ENABLE_TEST_AUTH=true`;
  - `ADMIN_EMAILS=chair@example.com`;
  - `RESEND_API_KEY=` and `EMAIL_FROM=` (both empty).
    Record the PID.
- Web: from `frontend-unified`, run `npx vite --port 5173` in the background, and record its PID too.

- [ ] **Step 2: Walk through it with the Playwright MCP browser**

1. Open `http://localhost:5173/documents/anything`. It should redirect to `/sign-in?next=...`.
2. Sign in as `chair@example.com` with code `000000`, and enter the name "Chair Admin" when asked. You should land on `/documents/anything` (a "Document not found" page is fine).
3. Reload the page. You should still be signed in.
4. Go to Live Meetings, join `DEMO`, and see the meeting. Reload: it rejoins `DEMO`.
5. Click "Leave meeting". The join screen shows, and you're still signed in.
6. Open the user menu, then Sign out. You should be back at `/sign-in`, and loading `/` redirects to sign-in again.

- [ ] **Step 3: Stop both servers by PID**

Remove any `.playwright-mcp/` folder the browser tool created in the repo.

---

### Task 7: Secure token storage and sign-in API (mobile)

**Files:**

- Modify: `mobile/package.json` (via `npx expo install`), `mobile/lib/storage.ts`, `mobile/lib/api.ts`
- Test: `mobile/__tests__/lib/storage.test.ts`, `mobile/__tests__/lib/api.test.ts`

- [ ] **Step 1: Add expo-secure-store**

Run (in `mobile`): `npx expo install expo-secure-store`
Expected: the SDK 57 compatible version is added to `mobile/package.json`, and `package-lock.json` is updated by npm.

- [ ] **Step 2: Write the failing tests**

`__tests__/lib/storage.test.ts`:

```ts
const store = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
  getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
  deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
}));

import { getToken, removeToken, storeToken } from '../../lib/storage';

describe('session token storage', () => {
  it('keeps the token in the secure store', async () => {
    await storeToken('tok');
    expect(await getToken()).toBe('tok');
    await removeToken();
    expect(await getToken()).toBeNull();
  });
});
```

Append to `__tests__/lib/api.test.ts`:

```ts
import { getMe, requestCode, signOut, updateName, verifyCode } from '../../lib/api';

describe('sign-in calls', () => {
  it('verifies as the mobile client and returns the token', async () => {
    const fetchMock = jest.fn(
      async () =>
        new Response(JSON.stringify({ user: { id: 1, email: 'a@b.c', name: null }, token: 't' })),
    );
    globalThis.fetch = fetchMock as jest.Mock;
    const result = await verifyCode('a@b.c', '123456');
    expect(result).toEqual({ user: { id: 1, email: 'a@b.c', name: null }, token: 't' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'a@b.c',
      code: '123456',
      client: 'mobile',
    });
  });

  it('sends the token as a bearer header', async () => {
    const fetchMock = jest.fn(
      async () => new Response(JSON.stringify({ user: { id: 1, email: 'a@b.c', name: 'A' } })),
    );
    globalThis.fetch = fetchMock as jest.Mock;
    await getMe('tok');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('treats a 401 from me as signed out', async () => {
    globalThis.fetch = jest.fn(
      async () => new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 }),
    ) as jest.Mock;
    expect(await getMe('expired')).toBeNull();
  });

  it('exports requestCode, updateName and signOut', () => {
    expect([requestCode, updateName, signOut].every((f) => typeof f === 'function')).toBe(true);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run (in `mobile`): `npx jest __tests__/lib`
Expected: FAIL. The storage test fails on AsyncStorage, and the API test fails because the functions are missing.

- [ ] **Step 4: Implement**

`lib/storage.ts`: keep the existing exports' names, but store the token in `expo-secure-store` (encrypted at rest). Replace the pending-auth helpers with the current meeting code (AsyncStorage is fine for that).

```ts
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
```

Check with grep for callers of the removed pending-auth helpers (`storePendingAuth` and friends); they're replaced in Tasks 8 and 9.

`lib/api.ts`: replace `requestVerification`, the old `verifyCode` and `logout` with the following, and keep `getApiUrl` and `errorMessage`.

```ts
export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
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

/** The signed-in user, or null when the token no longer works */
export async function getMe(token: string): Promise<SessionUser | null> {
  const response = await fetch(`${API_URL}/api/auth/me`, { headers: bearer(token) });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(await errorMessage(response, "Couldn't load your account"));
  return ((await response.json()) as { user: SessionUser }).user;
}

export async function updateName(token: string, name: string): Promise<SessionUser> {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    method: 'PATCH',
    headers: bearer(token),
    body: JSON.stringify({ name }),
  });
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
```

Update the existing api tests that call removed functions: `requestVerification` becomes `requestCode`, and `verifyCode` drops its meeting code argument.

- [ ] **Step 5: Run them to see them pass**

Run: `npx jest __tests__/lib && npx tsc --noEmit -p .`
Expected: the lib tests pass. Type errors remain in `context/SocketContext.tsx` and the auth screens; Tasks 8 and 9 fix them. Note them in the report.

- [ ] **Step 6: Commit**

```bash
git add package.json ../package-lock.json lib __tests__/lib
git commit -m "feat(mobile): keep the session token in the secure store and add the sign-in API"
```

---

### Task 8: Session context and sign-in screens (mobile)

**Files:**

- Create: `mobile/context/SessionContext.tsx`, `mobile/app/(auth)/name.tsx`
- Modify: `mobile/app/(auth)/login.tsx`, `mobile/app/(auth)/verify.tsx`, `mobile/app/(auth)/_layout.tsx`
- Test: `mobile/__tests__/context/SessionContext.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('../../lib/storage', () => ({
  getToken: jest.fn(),
  storeToken: jest.fn(async () => {}),
  removeToken: jest.fn(async () => {}),
}));
jest.mock('../../lib/api', () => ({
  getMe: jest.fn(),
  requestCode: jest.fn(async () => {}),
  verifyCode: jest.fn(),
  updateName: jest.fn(),
  signOut: jest.fn(async () => {}),
}));

import * as storage from '../../lib/storage';
import * as api from '../../lib/api';
import { SessionProvider, useSession } from '../../context/SessionContext';

const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);
const ann = { id: 1, email: 'ann@example.org', name: 'Ann' };

describe('SessionProvider (mobile)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('restores the session from the secure store on launch', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue('tok');
    (api.getMe as jest.Mock).mockResolvedValue(ann);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.user).toEqual(ann);
    expect(result.current.token).toBe('tok');
  });

  it('forgets a token the server no longer accepts', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue('old');
    (api.getMe as jest.Mock).mockResolvedValue(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(storage.removeToken).toHaveBeenCalled();
  });

  it('signs in, stores the token, and signs out', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    (api.verifyCode as jest.Mock).mockResolvedValue({ user: ann, token: 'new' });
    await act(() => result.current.verify('ann@example.org', '123456'));
    expect(storage.storeToken).toHaveBeenCalledWith('new');
    expect(result.current.status).toBe('signedIn');

    await act(() => result.current.signOut());
    expect(api.signOut).toHaveBeenCalledWith('new');
    expect(storage.removeToken).toHaveBeenCalled();
    expect(result.current.status).toBe('signedOut');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (in `mobile`): `npx jest __tests__/context`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `context/SessionContext.tsx`**

```tsx
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
      const saved = await getToken();
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
```

- [ ] **Step 4: Change the sign-in screens**

Keep each screen's existing layout and components (`Button`, inputs, theme, `SafeAreaView`); change only the fields and the calls.

- **`app/(auth)/login.tsx`:**
  - Only the email field: remove the name and meeting-code fields and their validation.
  - On submit, call `await useSession().requestCode(email)`, then `router.push({ pathname: '/(auth)/verify', params: { email } })`.
- **`app/(auth)/verify.tsx`:**
  - Read `email` from `useLocalSearchParams()`.
  - Submit with `await useSession().verify(email, fullCode)`, and show the thrown message on failure.
  - "Resend" calls `requestCode(email)`.
  - Root navigation (Task 9) takes it from there.
- **New `app/(auth)/name.tsx`:**
  - One "Your name" field (2 to 100 characters) and a Continue button that calls `useSession().setName(name)`. Copy the screen structure from `login.tsx`.
- **`app/(auth)/_layout.tsx`:** add `<Stack.Screen name="name" options={{ title: 'Your name' }} />`, following the existing entries' option style.

- [ ] **Step 5: Run the tests**

Run: `npx jest`
Expected: the new tests pass; existing component tests still pass.

- [ ] **Step 6: Commit**

```bash
git add context/SessionContext.tsx app/\(auth\) __tests__/context
git commit -m "feat(mobile): sign in with an emailed code and remember the session"
```

---

### Task 9: Meeting connection and navigation (mobile)

**Files:**

- Create: `mobile/app/(meeting)/join.tsx`
- Modify: `mobile/context/SocketContext.tsx`, `mobile/app/_layout.tsx`, `mobile/app/(meeting)/_layout.tsx`, and any screen that used `logout`/`isAuthenticated`
- Test: `mobile/__tests__/context/SocketContext.test.tsx`

**Behavior:**

- **`SocketContext`:**
  - It no longer signs in. It reads `{ token }` from `useSession()` and keeps `meetingCode` (restored from `getMeetingCode()` on mount).
  - It connects only when both are set, with `io(getApiUrl(), { auth: { token }, ... })`, and emits `JOIN_MEETING { meetingCode }`.
  - A `connect_error` "Not signed in" calls `useSession().signOut()`.
  - It exposes `meetingCode`, `joinMeeting(code)` (which stores the code) and `leaveMeeting()` (which emits `LEAVE_MEETING`, disconnects and clears the stored code).
  - It removes `login`, `verifyCode`, `resendCode`, `logout`, `pendingEmail` and `isAuthenticated`, and keeps the state, dispatch, timeout and version handling as they are.
  - `currentUser` comes from the session user, as on the web (Task 5, Step 6).
- **Navigation** (`app/_layout.tsx`): wrap in `SessionProvider` outside `SocketProvider`, then:
  - session `loading`: render nothing;
  - `signedOut`: go to `/(auth)/login`;
  - signed in with no name: go to `/(auth)/name`;
  - signed in with no meeting: go to `/(meeting)/join`;
  - connected to a meeting: go to `/(meeting)`.

- [ ] **Step 1: Write the failing test** (`__tests__/context/SocketContext.test.tsx`)

```tsx
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const sockets: Array<{
  opts: { auth?: { token?: string } };
  emit: jest.Mock;
  handlers: Record<string, (...a: unknown[]) => void>;
}> = [];
jest.mock('socket.io-client', () => ({
  io: jest.fn((_url: string, opts: { auth?: { token?: string } }) => {
    const socket = {
      opts,
      handlers: {} as Record<string, (...a: unknown[]) => void>,
      connected: false,
      on(event: string, handler: (...a: unknown[]) => void) {
        socket.handlers[event] = handler;
        return socket;
      },
      emit: jest.fn(),
      disconnect: jest.fn(),
      connect: jest.fn(),
    };
    sockets.push(socket);
    return socket;
  }),
}));
jest.mock('../../lib/storage', () => ({
  getMeetingCode: jest.fn(async () => null),
  storeMeetingCode: jest.fn(async () => {}),
}));
jest.mock('../../context/SessionContext', () => ({
  useSession: () => ({
    token: 'tok',
    user: { id: 1, email: 'a@b.c', name: 'Ann' },
    signOut: jest.fn(),
  }),
}));

import { SocketProvider, useSocket } from '../../context/SocketContext';

const wrapper = ({ children }: { children: ReactNode }) => (
  <SocketProvider>{children}</SocketProvider>
);

describe('SocketProvider (mobile)', () => {
  it('joins by code with the session token in the handshake', async () => {
    const { result } = renderHook(() => useSocket(), { wrapper });
    await act(async () => result.current.joinMeeting('demo'));
    await waitFor(() => expect(sockets.length).toBe(1));
    expect(sockets[0].opts.auth).toEqual({ token: 'tok' });
    act(() => sockets[0].handlers.connect());
    expect(sockets[0].emit).toHaveBeenCalledWith(
      'JOIN_MEETING',
      { meetingCode: 'DEMO' },
      expect.any(Function),
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest __tests__/context/SocketContext.test.tsx`
Expected: FAIL, because `joinMeeting` doesn't exist yet.

- [ ] **Step 3: Implement**

- Rework `context/SocketContext.tsx` as described above. Remove the auth code, keep the connection and dispatch code, and use `useSession`.
- Create `app/(meeting)/join.tsx`:
  - a "Meeting code" field (4 to 8 letters or digits, uppercased);
  - a "Join meeting" button calling `joinMeeting(code)`;
  - a "Sign out" button calling `useSession().signOut()`.
  - Use the login screen's structure.
- Update `app/_layout.tsx` with the navigation rules above.
- In `(meeting)` screens, replace any `logout` with `leaveMeeting`, labeled "Leave meeting".

- [ ] **Step 4: Run everything**

Run (in `mobile`): `npx tsc --noEmit -p . && npx jest`
Expected: type-check clean; all tests pass. Then run `grep -rn "request-verification\|pendingEmail\|robbie_pending_auth\|meetingCode: authState" app context lib`; it should print nothing.

- [ ] **Step 5: Commit**

```bash
git add context app __tests__/context
git commit -m "feat(mobile): join meetings by code with the stored session"
```

---

### Task 10: Docs and final check

**Files:** `spec.md`, `CLAUDE.md`

- [ ] **Step 1: Update docs**

- **`spec.md`, M2:** change the "Done 2026-10-06 (server)" bullet to say the web and mobile sign-in are done too. Name the parts:
  - the `/sign-in` page with the name step;
  - the route guard;
  - the user menu with sign out and sign out everywhere;
  - meetings join by code;
  - mobile's token in the secure store, restored on launch.
- **`spec.md`, M10:** mark "Restore the session on launch" done.
- **`CLAUDE.md`, under "Unified Frontend (frontend-unified)", in "State Management":** add `SessionContext - signed-in user (cookie session); RequireSession guards every route except /sign-in and /share`.

- [ ] **Step 2: Full check** (from the repo root)

Run: `npm run format:check && npm run lint && npx tsc --noEmit -p shared/tsconfig.json && npx tsc --noEmit -p backend-node/tsconfig.json && npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json && npm run test:run -w frontend-unified && npm run test:run -w mobile`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add spec.md CLAUDE.md
git commit -m "docs: record app-wide sign-in on web and mobile"
```

---

## Self-review notes

- **Design coverage:**
  - web session provider, sign-in page, guard, user menu, name in Settings and 401 handling: Tasks 1 to 4;
  - meetings join by code: Task 5;
  - live check: Task 6;
  - mobile secure store, restore on launch, bearer calls and sign-out: Tasks 7 and 8;
  - mobile join by code and navigation: Task 9.
- **Error shapes:** both kinds of server error (`{ error: string }` and `{ error: { message } }`) reach the user through the existing `errorMessage` helpers, which already handle both on web and mobile.
- **Order:**
  - Tasks 1 to 4 keep the web app working.
  - Task 5 switches the meetings module, so the web app is consistent again after it.
  - Mobile type errors exist between Tasks 7 and 9; each task reports them.
