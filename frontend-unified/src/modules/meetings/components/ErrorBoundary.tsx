import { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component to catch JavaScript errors anywhere in the child
 * component tree and display a fallback UI instead of crashing the whole app.
 *
 * Per React best practices, Error Boundaries must be class components as there
 * is no hook equivalent for componentDidCatch/getDerivedStateFromError.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // If a custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div
          className="min-h-[200px] flex items-center justify-center p-6"
          role="alert"
          aria-live="assertive"
        >
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md text-center">
            <div className="text-red-600 text-4xl mb-4" aria-hidden="true">
              ⚠️
            </div>
            <h2 className="text-lg font-semibold text-red-800 mb-2">Something went wrong</h2>
            <p className="text-sm text-red-700 mb-4">
              An unexpected error occurred. The meeting data is preserved.
            </p>
            {this.state.error && (
              <details className="text-left mb-4">
                <summary className="text-xs text-red-600 cursor-pointer hover:underline">
                  Technical details
                </summary>
                <pre className="mt-2 text-xs bg-red-100 p-2 rounded-sm overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-red-600 text-white rounded-sm hover:bg-red-700 text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              aria-label="Try again to recover from error"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
