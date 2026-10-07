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

/**
 * A meeting's day and time for display, in the viewer's time zone ("Tue, Oct 20, 7:00 PM"):
 * unlike a calendar date, a meeting is an instant
 */
export function formatMeetingTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * When a meeting starts, spelled out for the room's screen, in the viewer's time zone:
 * "Tuesday, October 20, 7:00 PM"
 */
export function formatScheduledStart(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

/**
 * A time of day in the viewer's time zone ("7:02 PM"), for a stored instant such as a meeting
 * log entry's. Some log entries hold a clock time already ("7:02:00 PM", from the device that
 * sent the action): those lose their seconds, and anything else is shown as is.
 */
export function formatClockTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const clock = /^(\d{1,2}:\d{2}):\d{2}(\s*[AP]M)$/i.exec(value.trim());
    return clock ? `${clock[1]}${clock[2]}` : value;
  }
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
