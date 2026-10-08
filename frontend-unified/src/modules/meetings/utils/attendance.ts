import type { Member } from '@robbie-bylawyer/shared/types';
import type { AttendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingRoster, Organization } from '../../../api/client';
import { atLeast } from '../../../utils/roles';

/** How a voting member of the organization stands in the meeting */
export type RosterStatus = 'connected' | 'marked' | 'absent' | 'not-joined';

export interface RosterRow {
  userId: number;
  name: string;
  status: RosterStatus;
}

const byName = new Intl.Collator(undefined, { sensitivity: 'base' });

/**
 * The organization's voting members (the member role and above) and how each stands in the
 * meeting: present on a connected device, marked present by the chair, absent, or not joined.
 * Viewers are left out: they join as guests and never count.
 */
export function rosterRows(roster: MeetingRoster, members: Member[]): RosterRow[] {
  const inMeeting = new Map(members.map((m) => [m.id, m]));
  return roster.members
    .filter((person) => atLeast(person.orgRole, 'member'))
    .map((person) => {
      const member = inMeeting.get(person.userId);
      const status: RosterStatus = !member
        ? 'not-joined'
        : !member.present
          ? 'absent'
          : member.presentBy === 'chair'
            ? 'marked'
            : 'connected';
      // Admins get each person's email, for a name to fall back on; the others don't
      const name = member?.name ?? person.name ?? person.email?.split('@')[0] ?? 'A member';
      return { userId: person.userId, name, status };
    })
    .sort((a, b) => byName.compare(a.name, b.name));
}

/** How someone added by email who hasn't signed in stands: counted in the room or not */
export type InviteStatus = 'waiting' | 'counted';

export interface InviteRow {
  inviteId: string;
  /** Their name, or for an admin their email: what goes into the headcount names */
  label: string;
  status: InviteStatus;
  /** False when the chair has neither name nor email: they go into the headcount unnamed */
  markable: boolean;
}

/**
 * People added by email who haven't signed in (the roster gives those who would vote): no
 * account, so the chair counts them in the room by name, in the headcount. One whose name is
 * among the headcount's names is counted.
 */
export function inviteRows(roster: MeetingRoster, headcountNames: string[]): InviteRow[] {
  const inRoom = new Set(headcountNames);
  return roster.invites
    .map((invite) => {
      const label = invite.name?.trim() || invite.email || '';
      return {
        inviteId: invite.id,
        label: label || 'Someone added by email',
        status: (label && inRoom.has(label) ? 'counted' : 'waiting') as InviteStatus,
        markable: !!label,
      };
    })
    .sort((a, b) => byName.compare(a.label, b.label));
}

/** The meeting's headcount, as SET_HEADCOUNT replaces it */
export interface Headcount {
  headcount: number;
  headcountNames: string[];
}

/** The headcount with one more person, by name */
export function countedInRoom(
  { headcount, headcountNames }: Headcount,
  name: string,
): { count: number; names: string[] } {
  return { count: headcount + 1, names: [...headcountNames, name] };
}

/** The headcount with one person fewer, by name (never fewer than the names left) */
export function takenOutOfRoom(
  { headcount, headcountNames }: Headcount,
  name: string,
): { count: number; names: string[] } {
  const at = headcountNames.indexOf(name);
  const names = at === -1 ? headcountNames : headcountNames.filter((_, i) => i !== at);
  return { count: Math.max(names.length, headcount - 1), names };
}

/**
 * Names in the headcount of people now here on a device: someone counted in the room before
 * they signed in, counted twice until the chair takes them out of the headcount
 */
export function countedTwice(members: Member[], headcountNames: string[]): string[] {
  const inRoom = new Set(headcountNames);
  return members
    .filter((m) => m.role !== 'guest' && m.present && m.presentBy !== 'chair' && inRoom.has(m.name))
    .map((m) => m.name);
}

/**
 * The voting members quorum is counted against: the organization's number, or else its voting
 * members in the roster, as the server counts them. Null while neither is known.
 */
export function eligibleCount(
  organization: Pick<Organization, 'eligibleVoters'> | null,
  roster: MeetingRoster | null,
): number | null {
  if (organization?.eligibleVoters) return organization.eligibleVoters;
  if (!roster) return null;
  return roster.members.filter((m) => atLeast(m.orgRole, 'member')).length;
}

/** "Quorum met", or how many more people are needed */
export function quorumLine(summary: AttendanceSummary): string {
  return summary.hasQuorum ? 'Quorum met' : `Need ${summary.quorum - summary.present} more`;
}

/** Attendance in one line for the console's top bar: "38 present of 142, quorum 29, met" */
export function attendanceChip(summary: AttendanceSummary, eligible: number | null): string {
  const of = eligible ? ` of ${eligible}` : '';
  return `${summary.present} present${of}, quorum ${summary.quorum}, ${summary.hasQuorum ? 'met' : 'not met'}`;
}
