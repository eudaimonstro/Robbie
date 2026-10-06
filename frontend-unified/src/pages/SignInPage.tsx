import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { useSession } from '../context/SessionContext';

/** Where to go after signing in: a path inside the app, never another site */
function safeNext(next: string | null): string {
  if (!next) return '/';
  // Parse it as the browser would: `/\evil.com` is `//evil.com`, another site
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return '/';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.';

export default function SignInPage() {
  const { status, user, requestCode, verify, setName, signOut } = useSession();
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
    run(async () => {
      await verify(email.trim(), code.trim());
      // Signed in: if the session ends from here, start again at the email step
      setCodeSent(false);
      setCode('');
    });
  };
  const onName = (e: FormEvent) => {
    e.preventDefault();
    run(() => setName(name.trim()));
  };
  const onDifferentEmail = () => {
    run(async () => {
      await signOut();
      setEmail('');
      setNameInput('');
    });
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
            <button
              type="button"
              className="btn-ghost w-full"
              disabled={busy}
              onClick={onDifferentEmail}
            >
              Use a different email
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
