import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { TermsCheckbox } from '../components/auth/TermsCheckbox';

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

/** The meeting a sign-in is for, when it came from a meeting's link or QR code */
function meetingCodeOf(next: string): string | null {
  const match = next.match(/^\/meetings\/([A-Za-z0-9]{4,8})(?:\/display)?\/?(?:[?#].*)?$/);
  return match?.[1] ? match[1].toUpperCase() : null;
}

export default function SignInPage() {
  const {
    status,
    user,
    termsAccepted,
    suggestedName,
    requestCode,
    verify,
    setName,
    acceptTerms,
    signOut,
  } = useSession();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const meetingCode = meetingCodeOf(next);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  // Null until typed: the name given when they were added by email, if any, until then
  const [typedName, setNameInput] = useState<string | null>(null);
  const name = typedName ?? suggestedName ?? '';
  const [resent, setResent] = useState(false);
  const [agreed, setAgreed] = useState(false);
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
      setResent(false);
      setCodeSent(true);
    });
  };
  const onSendNewCode = () => {
    run(async () => {
      await requestCode(email.trim());
      setCode('');
      setResent(true);
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
    if (!termsAccepted && !agreed) return;
    run(async () => {
      // Agree first: the Privacy Policy covers the name, so it is stored only once the user
      // agreed. If naming then fails, the checkbox is gone and only the name is asked again.
      if (!termsAccepted) await acceptTerms();
      await setName(name.trim());
    });
  };
  const onDifferentEmail = () => {
    run(async () => {
      await signOut();
      setEmail('');
      setNameInput(null);
      setAgreed(false);
    });
  };

  const step = status === 'signedIn' ? 'name' : codeSent ? 'code' : 'email';

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <Scale className="w-6 h-6 text-gavel" aria-hidden="true" />
          <h1 className="text-xl font-heading font-bold text-ink">
            {step === 'name'
              ? 'Welcome'
              : meetingCode
                ? `Sign in to join meeting ${meetingCode}`
                : 'Sign in to Robbie'}
          </h1>
        </div>
        {meetingCode && step !== 'name' && (
          <p className="mb-4 text-sm text-ink-muted">
            Sign in with your email to follow the meeting and vote on this phone. Robbie emails you
            a code: there is no password.
          </p>
        )}

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
            <p role="status" className="text-sm text-ink-muted">
              {resent ? 'We sent a new code to' : 'We sent a 6-digit code to'} {email.trim()}. It
              works for 15 minutes.
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
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'code-problem' : undefined}
                onChange={(e) => setCode(e.target.value)}
              />
              {/* By the field it is about */}
              {error && (
                <p id="code-problem" role="alert" className="mt-1 text-sm text-gavel">
                  {error}
                </p>
              )}
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              Sign in
            </button>
            <button
              type="button"
              className="btn-secondary w-full"
              disabled={busy}
              onClick={onSendNewCode}
            >
              Send a new code
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                setCodeSent(false);
                setCode('');
                setError(null);
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        {step === 'name' && (
          <form onSubmit={onName} className="space-y-4">
            <p className="text-sm text-ink-muted">What should others see in meetings?</p>
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
            {!termsAccepted && <TermsCheckbox checked={agreed} onChange={setAgreed} />}
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={busy || (!termsAccepted && !agreed)}
            >
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

        {error && step !== 'code' && (
          <p role="alert" className="mt-4 text-sm text-gavel">
            {error}
          </p>
        )}
        {meetingCode && step !== 'name' && (
          <p className="mt-6 border-t border-rule pt-4 text-sm text-ink-muted">
            No phone? You still count: the chair will count you in the room.
          </p>
        )}
      </div>
    </main>
  );
}
