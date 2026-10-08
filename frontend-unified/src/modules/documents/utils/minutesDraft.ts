/**
 * The minutes text typed in this browser and not yet saved, kept per minutes until the server
 * has it: a save that fails on the way out of the page (offline, the tab closed) leaves it here,
 * and the editor offers it back next time. Storage may be off (a private window): then nothing
 * is kept, and nothing breaks.
 */
export interface MinutesDraft {
  text: string;
  /** When it was typed (ISO) */
  at: string;
}

const key = (minutesId: string) => `robbie.minutesDraft.${minutesId}`;

export function keepDraft(minutesId: string, text: string): void {
  try {
    localStorage.setItem(key(minutesId), JSON.stringify({ text, at: new Date().toISOString() }));
  } catch {
    // Storage full or off: the autosave still runs
  }
}

export function readDraft(minutesId: string): MinutesDraft | null {
  try {
    const stored = localStorage.getItem(key(minutesId));
    if (!stored) return null;
    const draft = JSON.parse(stored) as Partial<MinutesDraft>;
    return typeof draft.text === 'string' && typeof draft.at === 'string'
      ? { text: draft.text, at: draft.at }
      : null;
  } catch {
    return null;
  }
}

export function dropDraft(minutesId: string): void {
  try {
    localStorage.removeItem(key(minutesId));
  } catch {
    // Nothing to drop
  }
}
