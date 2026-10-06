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
