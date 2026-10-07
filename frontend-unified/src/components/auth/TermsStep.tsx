import { useState, type FormEvent } from 'react';
import { Scale } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import { TermsCheckbox } from './TermsCheckbox';

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.';

/**
 * Shown in place of the app to a signed-in user who hasn't accepted the current terms: they
 * changed since the user last accepted, or a request was refused for that reason
 */
export function TermsStep() {
  const { acceptTerms, signOut } = useSession();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (agreed) void run(acceptTerms);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Scale className="w-6 h-6 text-gavel" aria-hidden="true" />
          <h1 className="text-xl font-heading font-bold text-ink">Before you go on</h1>
        </div>
        <p className="text-sm text-ink-muted">
          Robbie needs your agreement to its Terms of Service and Privacy Policy. If you agreed
          before, they have changed since.
        </p>
        <TermsCheckbox checked={agreed} onChange={setAgreed} />
        <button type="submit" className="btn-primary w-full" disabled={busy || !agreed}>
          Continue
        </button>
        <button
          type="button"
          className="btn-ghost w-full"
          disabled={busy}
          onClick={() => void run(signOut)}
        >
          Sign out
        </button>
        {error && (
          <p role="alert" className="text-sm text-gavel">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
