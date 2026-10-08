import { useSyncExternalStore } from 'react';

/** Below Tailwind's md breakpoint (48rem): a phone, where the sidebar is a drawer */
export const BELOW_MD = '(max-width: 47.99rem)';

/**
 * Whether the media query matches now, following it as the window changes. False where the
 * browser can't tell (no matchMedia, as in tests that don't provide one).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia?.(query);
      if (!list) return () => {};
      list.addEventListener?.('change', onChange);
      return () => list.removeEventListener?.('change', onChange);
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}
