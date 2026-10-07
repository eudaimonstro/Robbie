/**
 * A live meeting (/meetings/CODE, not the Live Meetings page) takes the full width: the sidebar
 * folds into the drawer phones use, opened from the header's menu button at every width
 */
export function isFocusPath(pathname: string): boolean {
  return /^\/meetings\/[^/]+\/?$/.test(pathname);
}
