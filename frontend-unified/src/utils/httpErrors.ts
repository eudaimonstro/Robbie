/**
 * Whether a failed request was answered 404: the record doesn't exist, or isn't the user's to
 * see (the API answers both alike). Anything else (a 500, no answer) is a failure to load, said
 * as one and offered again, never shown as "not found".
 */
export function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: unknown }).status === 404;
}
