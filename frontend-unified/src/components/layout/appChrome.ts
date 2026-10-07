import { createContext, useContext, useEffect } from 'react';

/** What a page can ask of the app's frame around it */
export interface AppChrome {
  /** Open the app's drawer: the sidebar's links, folded away in a live meeting */
  openMenu: () => void;
  /** The page has a header of its own on phones: the app's header steps aside below md */
  setOwnHeader: (own: boolean) => void;
}

export const AppChromeContext = createContext<AppChrome | null>(null);

/**
 * For a page that carries its own header on phones (a live meeting's phone view): hides the
 * app's header below the md breakpoint while the page is shown, and returns what opens the
 * app's drawer, for the page's own menu button. Null outside the app's layout.
 */
export function useOwnHeader(): (() => void) | null {
  const chrome = useContext(AppChromeContext);
  useEffect(() => {
    if (!chrome) return;
    chrome.setOwnHeader(true);
    return () => chrome.setOwnHeader(false);
  }, [chrome]);
  return chrome?.openMenu ?? null;
}
