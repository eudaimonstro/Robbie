import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-6xl font-bold text-gavel mb-4">404</h1>
      <h2 className="text-2xl font-heading font-semibold text-ink mb-2">Page not found</h2>
      <p className="text-ink-muted mb-8 max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex gap-4">
        <Link to="/" className="btn-primary flex items-center gap-2">
          <Home className="w-4 h-4" aria-hidden="true" />
          Go to Home
        </Link>
        <button onClick={() => window.history.back()} className="btn-ghost flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Go back
        </button>
      </div>
    </div>
  );
}
