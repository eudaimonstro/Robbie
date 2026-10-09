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
