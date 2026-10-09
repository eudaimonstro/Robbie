/**
 * Pure utility functions for generating IDs and timestamps
 * These should be called BEFORE dispatching actions, not inside reducers
 */

/**
 * Generate a unique ID using timestamp + random suffix to avoid collisions
 */
export function generateId(): number {
  const randomSuffix = crypto.getRandomValues(new Uint16Array(1))[0];
  return Date.now() * 1000 + (randomSuffix % 1000);
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
