/**
 * Robbie stamps meeting actions with a display time from toLocaleTimeString() (for example
 * "12:47:25 AM"), which has no date and doesn't parse. A synced amendment needs a real date,
 * so use the timestamp when it parses and the current time otherwise; the sync runs as the
 * vote closes, so the current time is the decision time.
 */
export function toDecisionDate(timestamp?: string, now: Date = new Date()): Date {
  if (!timestamp) return now;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? now : parsed;
}
