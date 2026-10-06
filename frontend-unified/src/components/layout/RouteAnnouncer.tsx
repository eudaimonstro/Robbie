import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Announces route changes to screen readers using an aria-live region.
 * This ensures screen reader users are notified when the page content changes.
 */
export function RouteAnnouncer() {
  const location = useLocation();
  const announcerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Wait for the page title to be updated by the new route
    const timeoutId = setTimeout(() => {
      if (announcerRef.current) {
        const pageTitle = document.title || 'Page loaded';
        announcerRef.current.textContent = pageTitle;
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [location.pathname]);

  return (
    <div
      ref={announcerRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    />
  );
}
