interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }

  return (
    <div
      className={`spinner text-primary-600 ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}

export function LoadingPage() {
  return (
    <div className="flex items-center justify-center h-64">
      <LoadingSpinner size="lg" />
    </div>
  )
}

export function LoadingOverlay() {
  return (
    <div className="absolute inset-0 bg-white/80 dark:bg-secondary-900/80 flex items-center justify-center z-10">
      <LoadingSpinner size="lg" />
    </div>
  )
}
