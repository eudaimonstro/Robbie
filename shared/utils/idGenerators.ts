/**
 * Pure utility functions for generating IDs and timestamps
 * These should be called BEFORE dispatching actions, not inside reducers
 */

/**
 * Generate a unique ID using timestamp + random suffix to avoid collisions
 */
export function generateId(): number {
  // Use crypto for randomness, fallback to Math.random for older environments
  const randomSuffix =
    typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint16Array(1))[0]
      : Math.floor(Math.random() * 65536);
  return Date.now() * 1000 + (randomSuffix % 1000);
}

/**
 * Generate a cryptographically secure meeting code
 * Uses Web Crypto API (available in browsers and Node.js 19+)
 */
export function generateMeetingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous: 0, O, 1, I
  const length = 6;

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => chars[byte % chars.length]).join('');
  }

  // Fallback for environments without crypto (should not happen in modern env)
  console.warn('crypto.getRandomValues not available, using Math.random fallback');
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Generate a human-readable timestamp for the current time
 * @returns Time string in locale format (e.g., "10:30:45 AM")
 */
export function generateTimestamp(): string {
  return new Date().toLocaleTimeString();
}

/**
 * Calculate the end timestamp for a timer
 * @param secondsFromNow - Number of seconds until timer expires
 * @returns Unix timestamp (ms) when timer ends, or null if no timer
 */
export function calculateTimerEnd(secondsFromNow: number): number | null {
  return secondsFromNow > 0 ? Date.now() + secondsFromNow * 1000 : null;
}
