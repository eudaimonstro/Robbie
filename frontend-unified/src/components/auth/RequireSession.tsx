import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../../context/SessionContext';
import { LoadingPage } from '../ui/LoadingSpinner';
import { TermsStep } from './TermsStep';

/**
 * Show the children only to a signed-in user with a name who accepted the current terms. Anyone
 * signed out or without a name goes to sign in (the name step asks for the terms too); a user
 * who hasn't accepted the current terms gets the terms step, before the children make any
 * request the server would refuse.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { status, user, termsAccepted, retry } = useSession();
  const location = useLocation();

  if (status === 'loading') return <LoadingPage label="Loading Robbie..." />;
  // The session couldn't be checked: offer a retry rather than sending a signed-in user to sign in
  if (status === 'unreachable') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-paper p-4">
        <div className="card w-full max-w-sm p-6 text-center">
          <h1 className="text-xl font-heading font-bold text-ink mb-2">Can't reach the server</h1>
          <p className="text-sm text-ink-muted mb-4">Check your connection and try again.</p>
          <button type="button" className="btn-primary w-full" onClick={() => void retry()}>
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (status === 'signedOut' || !user?.name) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  if (!termsAccepted) return <TermsStep />;
  return <>{children}</>;
}
