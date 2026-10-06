/**
 * Format a calendar date (effective date, adoption date) for display.
 *
 * These are stored as midnight UTC on the chosen day. Formatting in the viewer's
 * time zone would show the previous day anywhere west of UTC, so format in UTC.
 */
export function formatCalendarDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { timeZone: 'UTC' });
}

/**
 * The value for a `datetime-local` input ("2026-10-06T19:00") showing a stored instant in the
 * viewer's time zone. (Slicing the ISO string would show the UTC time instead.)
 */
export function toLocalDateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The exact instant (ISO, UTC) a `datetime-local` value means in the viewer's time zone. Sent
 * as is, the value has no time zone and the server reads it in its own.
 */
export function fromLocalDateTimeInput(value: string): string {
  const date = new Date(value);
  // An empty or unparseable value is passed on as '', for the server to reject with a message
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
