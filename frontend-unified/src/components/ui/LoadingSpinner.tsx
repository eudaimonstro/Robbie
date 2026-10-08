interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div
      className={`spinner text-gavel ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

/**
 * A page that is loading: the spinner and, under it, what is loading ("Loading the bylaws..."),
 * so a slow first load doesn't look like a blank page
 */
export function LoadingPage({ label = 'Loading...' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex h-64 flex-col items-center justify-center gap-3 text-ink-muted"
    >
      <div className="spinner h-12 w-12 text-gavel" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function LoadingOverlay() {
  return (
    <div className="absolute inset-0 bg-paper/80 flex items-center justify-center z-10">
      <LoadingSpinner size="lg" />
    </div>
  );
}
