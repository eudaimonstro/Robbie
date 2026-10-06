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
