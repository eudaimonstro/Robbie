/**
 * Pure utility functions for generating IDs and timestamps
 * These should be called BEFORE dispatching actions, not inside reducers
 */

export function generateId(): number {
  return Date.now();
}

export function generateMeetingCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function generateTimestamp(): string {
  return new Date().toLocaleTimeString();
}

export function calculateTimerEnd(secondsFromNow: number): number | null {
  return secondsFromNow > 0 ? Date.now() + secondsFromNow * 1000 : null;
}
