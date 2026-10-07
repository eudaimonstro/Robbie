import type { MinutesRecord, MinutesSummary } from '../../../api/client';

/** The meeting minutes are of, by its title or else its code: "2026 Annual Meeting" */
export function meetingName(minutes: Pick<MinutesRecord | MinutesSummary, 'packet'>): string {
  return minutes.packet.title || `Meeting ${minutes.packet.robbieCode}`;
}
