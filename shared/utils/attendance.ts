import type { MeetingState, Member } from '../types/index.js';

/**
 * Whether a member of the meeting takes part in it: moves, seconds, votes and counts toward the
 * quorum. Guests and observers don't, nor does a presiding officer without a vote (in a board
 * meeting, one who isn't a director).
 */
export function takesPart(member: Pick<Member, 'role' | 'nonVoting'>): boolean {
  return member.role !== 'guest' && member.role !== 'observer' && !member.nonVoting;
}

/** Whether the meeting is the board's: its directors vote (see MeetingState.board) */
export function isBoardMeeting(state: Pick<MeetingState, 'board'>): boolean {
  return !!state.board;
}

/**
 * A board's quorum: the number the organization sets (its bylaws'), else a majority of its
 * directors; never more than the directors there are, and at least 1
 */
export function boardQuorum(directors: number, setting: number | null): number {
  const quorum = setting ?? Math.floor(directors / 2) + 1;
  return Math.max(1, directors > 0 ? Math.min(quorum, directors) : quorum);
}

/** The most directors a board can have for its chair to take part as any director does */
export const SMALL_BOARD = 12;

/**
 * A board meeting of no more than SMALL_BOARD directors (RONR 49:21): its chair, a director,
 * votes on every question and may move and second, like any director
 */
export function smallBoard(state: Pick<MeetingState, 'board'>): boolean {
  return !!state.board && state.board.directors <= SMALL_BOARD;
}

/** Who is present, and whether that makes a quorum */
export interface AttendanceSummary {
  /** Members present because their device is connected */
  devicePresent: number;
  /** Members the chair or secretary marked present */
  markedPresent: number;
  /** People in the room without an account */
  headcount: number;
  /** Paper proxies and absentee ballots the chair holds */
  proxiesHeld: number;
  /** Everyone who counts toward quorum: the five above */
  present: number;
  quorum: number;
  hasQuorum: boolean;
  /** Guests present: they never count toward quorum */
  guests: number;
  /**
   * The organization's people present who don't vote in a board meeting (observers, and a
   * presiding officer who isn't a director): they never count either
   */
  observers: number;
}

/**
 * The one count of attendance: the server's quorum check, the meeting screens, the display
 * and the minutes all use it. Guests never count. Missing fields (a state saved before they
 * existed) count as none.
 */
export function attendanceSummary(state: MeetingState): AttendanceSummary {
  const voting = state.members.filter(takesPart);
  const present = voting.filter((m) => m.present);
  const markedPresent = present.filter((m) => m.presentBy === 'chair').length;
  const devicePresent = present.length - markedPresent;
  // A board meeting counts its directors only: nobody is counted in the room without an
  // account, and directors don't vote by proxy
  const board = isBoardMeeting(state);
  const headcount = board ? 0 : (state.headcount ?? 0);

  const proxiesHeld = board ? 0 : (state.proxiesHeld ?? 0);
  const total = devicePresent + markedPresent + headcount + proxiesHeld;
  return {
    devicePresent,
    markedPresent,
    headcount,
    proxiesHeld,
    present: total,
    quorum: state.quorum,
    hasQuorum: total >= state.quorum,
    guests: state.members.filter((m) => m.role === 'guest' && m.present).length,
    observers: state.members.filter((m) => m.present && m.role !== 'guest' && !takesPart(m)).length,
  };
}

/** The meeting's counts as SET_HEADCOUNT replaces them (its `base`) */
export function headcountBaseOf(state: MeetingState): {
  count: number;
  names: string[];
  proxiesHeld: number;
  invites: string[];
} {
  return {
    count: state.headcount ?? 0,
    names: state.headcountNames ?? [],
    proxiesHeld: state.proxiesHeld ?? 0,
    invites: state.headcountInvites ?? [],
  };
}

/** Whether the meeting still has the counts a SET_HEADCOUNT was made from */
export function headcountBaseHolds(
  state: MeetingState,
  base: { count: number; names: string[]; proxiesHeld: number; invites?: string[] },
): boolean {
  const now = headcountBaseOf(state);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  return (
    now.count === base.count &&
    now.proxiesHeld === base.proxiesHeld &&
    same(now.names, base.names) &&
    (base.invites === undefined || same(now.invites, base.invites))
  );
}

/** An organization's attendance settings (see Organization in the Prisma schema) */
export interface QuorumSettings {
  eligibleVoters: number | null;
  quorumPercent: number | null;
  quorumCount: number | null;
}

/**
 * Whether the organization has set its voting members and its quorum: a meeting can't open
 * before (the server refuses to make its live state). A quorum count without voting members is
 * the old default (3), never chosen, so it doesn't count as set.
 */
export function isQuorumSet(settings: QuorumSettings): boolean {
  return (
    settings.eligibleVoters !== null &&
    (settings.quorumPercent !== null || settings.quorumCount !== null)
  );
}

/**
 * The quorum a meeting starts with: a percentage of the eligible voting members (the
 * organization's count, or else `rosterVoters`, its members with the member role or above),
 * rounded up, or a fixed count. At least 1. A meeting opens only once both are set
 * (isQuorumSet), so the roster's count and the 3 when nothing is set serve only live states
 * made before that rule.
 */
export function quorumFromSettings(settings: QuorumSettings, rosterVoters: number): number {
  if (settings.quorumPercent !== null) {
    const eligible = settings.eligibleVoters ?? rosterVoters;
    return Math.max(1, Math.ceil((eligible * settings.quorumPercent) / 100));
  }
  return Math.max(1, settings.quorumCount ?? 3);
}
