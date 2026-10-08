/** An email address as accounts store it: trimmed and lowercased */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
