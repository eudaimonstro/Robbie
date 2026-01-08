/**
 * Date formatting utilities.
 *
 * All timestamps from the API are stored in UTC and are automatically
 * converted to the user's local timezone when displayed.
 */

/**
 * Format a date/time string for display in the user's local timezone.
 * @param isoString - ISO 8601 date string from the API
 * @returns Formatted date and time string, or empty string if invalid
 */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return ''
  try {
    return new Date(isoString).toLocaleString()
  } catch {
    return ''
  }
}

/**
 * Format a date string for display (date only, no time).
 * @param isoString - ISO 8601 date string from the API
 * @returns Formatted date string, or empty string if invalid
 */
export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return ''
  try {
    return new Date(isoString).toLocaleDateString()
  } catch {
    return ''
  }
}

/**
 * Format a date/time string with relative time indication.
 * @param isoString - ISO 8601 date string from the API
 * @returns Formatted string with relative indicator (e.g., "Today", "Yesterday")
 */
export function formatDateTimeRelative(isoString: string | null | undefined): string {
  if (!isoString) return ''
  try {
    const date = new Date(isoString)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString()}`
    } else if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString()}`
    } else if (diffDays < 7) {
      return date.toLocaleDateString(undefined, { weekday: 'long' }) + ` at ${date.toLocaleTimeString()}`
    }
    return date.toLocaleString()
  } catch {
    return ''
  }
}
