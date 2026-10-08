import { useEffect, useState } from 'react';
import { meetingPackets, type MeetingRoster } from '../../../api/client';

/**
 * The meeting's organization's roster, loaded once per meeting and again when `refreshKey`
 * changes (the console passes how many people the meeting has, so someone added by email who
 * signs in during it moves from "not yet signed in" to the members). People outside the
 * organization (guests) are refused it, and get the error. A reload keeps the roster it has.
 */
export function useRoster(meetingCode: string, enabled = true, refreshKey: unknown = null) {
  const [loaded, setLoaded] = useState<{
    code: string;
    roster: MeetingRoster | null;
    error: string | null;
  } | null>(null);

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
          setLoaded({ code: meetingCode, roster: null, error });
        }
      });
    return () => {
      canceled = true;
    };
  }, [meetingCode, enabled, refreshKey]);

  // A roster loaded for another meeting is not this one's
  const current = loaded?.code === meetingCode ? loaded : null;
  return { roster: current?.roster ?? null, error: current?.error ?? null };
}
