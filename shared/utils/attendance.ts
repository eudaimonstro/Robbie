import type { MeetingState } from '../types/index.js';

/** Who is present, and whether that makes a quorum */
export interface AttendanceSummary {
  /** Members present because their device is connected */
  devicePresent: number;
  /** Members the chair or secretary marked present */
  markedPresent: number;
  /** People in the room without an account */
  headcount: number;
  /** Absent members represented by a present proxy holder, when proxies count for quorum */
  proxies: number;
  /** Everyone who counts toward quorum: the four above */
  present: number;
  quorum: number;
  hasQuorum: boolean;
  /** Guests present: they never count toward quorum */
  guests: number;
}

/**
 * The one count of attendance: the server's quorum check, the meeting screens, the display
 * and the minutes all use it. Guests never count. Missing fields (a state saved before they
 * existed) count as none.
 */
export function attendanceSummary(state: MeetingState): AttendanceSummary {
  const voting = state.members.filter((m) => m.role !== 'guest');
  const present = voting.filter((m) => m.present);
  const markedPresent = present.filter((m) => m.presentBy === 'chair').length;
  const devicePresent = present.length - markedPresent;
  const headcount = state.headcount ?? 0;

  let proxies = 0;
  if (state.proxiesCountForQuorum) {
    const presentIds = new Set(present.map((m) => m.id));
    const absentIds = new Set(voting.filter((m) => !m.present).map((m) => m.id));
    proxies = (state.proxies ?? []).filter(
      (p) => presentIds.has(p.grantedTo) && absentIds.has(p.grantedBy),
    ).length;
  }

  const total = devicePresent + markedPresent + headcount + proxies;
  return {
    devicePresent,
    markedPresent,
    headcount,
    proxies,
    present: total,
    quorum: state.quorum,
    hasQuorum: total >= state.quorum,
    guests: state.members.filter((m) => m.role === 'guest' && m.present).length,
  };
}

/** An organization's attendance settings (see Organization in the Prisma schema) */
export interface QuorumSettings {
  eligibleVoters: number | null;
  quorumPercent: number | null;
  quorumCount: number | null;
}

/**
 * The quorum a meeting starts with: a percentage of the eligible voting members (the
 * organization's count, or else `rosterVoters`, its members with the member role or above),
 * rounded up, or a fixed count. At least 1; 3 when nothing is set.
 */
export function quorumFromSettings(settings: QuorumSettings, rosterVoters: number): number {
  if (settings.quorumPercent !== null) {
    const eligible = settings.eligibleVoters ?? rosterVoters;
    return Math.max(1, Math.ceil((eligible * settings.quorumPercent) / 100));
  }
  return Math.max(1, settings.quorumCount ?? 3);
}
