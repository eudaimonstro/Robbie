import { Link } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-6xl font-bold text-primary-600 mb-4">404</h1>
      <h2 className="text-2xl font-heading font-semibold text-secondary-800 dark:text-secondary-200 mb-2">
        Page Not Found
      </h2>
      <p className="text-secondary-600 dark:text-secondary-400 mb-8 max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex gap-4">
        <Link
          to="/"
          className="btn-primary flex items-center gap-2"
        >
          <Home className="w-4 h-4" />
          Go to Dashboard
        </Link>
        <button
          onClick={() => window.history.back()}
          className="btn-ghost flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>
      </div>
    </div>
  )
}
