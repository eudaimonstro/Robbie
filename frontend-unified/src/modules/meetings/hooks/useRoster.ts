import { useEffect, useState } from 'react';
import { meetingPackets, type MeetingRoster } from '../../../api/client';

/** How often the roster is read again while the meeting is open (people added or signing in) */
export const ROSTER_REFRESH_MS = 30_000;

/**
 * The meeting's organization's roster, loaded once per meeting and again when `refreshKey`
 * changes (the console passes how many people the meeting has, so someone added by email who
 * signs in during it moves from "not yet signed in" to the members), every 30 seconds, and when
 * the window comes back into focus (someone added in Settings meanwhile). People outside the
 * organization (guests) are refused it, and get the error. A reload keeps the roster it has.
 */
export function useRoster(meetingCode: string, enabled = true, refreshKey: unknown = null) {
  const [loaded, setLoaded] = useState<{
    code: string;
    roster: MeetingRoster | null;
    error: string | null;
  } | null>(null);
  // Bumped by the timer and by focus
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const again = () => setTick((n) => n + 1);
    const timer = setInterval(again, ROSTER_REFRESH_MS);
    window.addEventListener('focus', again);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', again);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let canceled = false;
    meetingPackets
      .roster(meetingCode)
      .then((roster) => {
        if (!canceled) setLoaded({ code: meetingCode, roster, error: null });
      })
      .catch((err: unknown) => {
        if (!canceled) {
          const error = err instanceof Error ? err.message : "Couldn't load the roster";
          // A failed reload keeps the roster this meeting already has
          setLoaded((current) =>
            current?.code === meetingCode && current.roster
              ? current
              : { code: meetingCode, roster: null, error },
          );
        }
      });
    return () => {
      canceled = true;
    };
  }, [meetingCode, enabled, refreshKey, tick]);

  // A roster loaded for another meeting is not this one's
  const current = loaded?.code === meetingCode ? loaded : null;
  return { roster: current?.roster ?? null, error: current?.error ?? null };
}
