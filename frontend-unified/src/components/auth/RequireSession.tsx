import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../../context/SessionContext';
import { LoadingPage } from '../ui/LoadingSpinner';

/** Show the children only to a signed-in user with a name; send anyone else to sign in */
export function RequireSession({ children }: { children: ReactNode }) {
  const { status, user, retry } = useSession();
  const location = useLocation();

  if (status === 'loading') return <LoadingPage />;
  // The session couldn't be checked: offer a retry rather than sending a signed-in user to sign in
  if (status === 'unreachable') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-900 p-4">
        <div className="card w-full max-w-sm p-6 text-center">
          <h1 className="text-xl font-heading font-bold text-secondary-900 dark:text-white mb-2">
            Can't reach the server
          </h1>
          <p className="text-sm text-secondary-600 dark:text-secondary-400 mb-4">
            Check your connection and try again.
          </p>
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
  return <>{children}</>;
}
