import { useEffect, useState } from 'react';
import { getPacket } from '../components/scheduling/api';
import type { MeetingPacket } from '../components/scheduling/types';

/**
 * The meeting's packet: its agenda items with their attachments, and when it was called to
 * order. Loaded again when `refreshKey` changes (the console passes meetingActive, so the start
 * time arrives with the call to order).
 */
export function usePacket(meetingCode: string, refreshKey: unknown = null): MeetingPacket | null {
  const [loaded, setLoaded] = useState<{ code: string; packet: MeetingPacket | null } | null>(null);

  useEffect(() => {
    let canceled = false;
    getPacket(meetingCode)
      .then((packet) => {
        if (!canceled) setLoaded({ code: meetingCode, packet });
      })
      .catch(() => {
        // The packet only adds attachments and the start time; the meeting runs without them
        if (!canceled) setLoaded({ code: meetingCode, packet: null });
      });
    return () => {
      canceled = true;
    };
  }, [meetingCode, refreshKey]);

  return loaded?.code === meetingCode ? loaded.packet : null;
}
