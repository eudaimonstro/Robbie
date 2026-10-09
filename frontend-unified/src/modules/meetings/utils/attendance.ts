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
  /** The name they were added with: what goes into the headcount's names (none: unnamed) */
  name: string | null;
  /** What the roster shows: the name, or for an admin the email (never in the minutes) */
  label: string;
  status: InviteStatus;
}

/**
 * People added by email who haven't signed in (the roster gives those who would vote): no
 * account, so the chair counts them in the room, in the headcount (by name when they have one).
 * The meeting keeps which pending additions are counted (headcountInvites), so two with the
 * same name, or without one, stay apart.
 */
export function inviteRows(roster: MeetingRoster, headcountInvites: string[]): InviteRow[] {
  const counted = new Set(headcountInvites);
  return roster.invites
    .map((invite) => {
      const name = invite.name?.trim() || null;
      return {
        inviteId: invite.id,
        name,
        label: name ?? invite.email ?? 'Someone added by email',
        status: (counted.has(invite.id) ? 'counted' : 'waiting') as InviteStatus,
      };
    })
    .sort((a, b) => byName.compare(a.label, b.label));
}

/** The meeting's headcount, as SET_HEADCOUNT replaces it */
export interface Headcount {
  headcount: number;
  headcountNames: string[];
  headcountInvites?: string[];
}

/** A new headcount: the count, the names and the pending additions counted */
export interface HeadcountChange {
  count: number;
  names: string[];
  invites: string[];
}

/** The headcount with someone added by email counted in the room (null: they already are) */
export function countedInRoom(
  { headcount, headcountNames, headcountInvites = [] }: Headcount,
  invite: { inviteId: string; name: string | null },
): HeadcountChange | null {
  if (headcountInvites.includes(invite.inviteId)) return null;
  return {
    count: headcount + 1,
    names: invite.name ? [...headcountNames, invite.name] : headcountNames,
    invites: [...headcountInvites, invite.inviteId],
  };
}

/** One occurrence of a name gone from the names */
const withoutName = (names: string[], name: string | null) => {
  if (!name) return names;
  const at = names.indexOf(name);
  return at === -1 ? names : names.filter((_, i) => i !== at);
};

/**
 * The headcount with one person fewer: someone added by email (by their addition, and their
 * name), or a name (null: not counted). Never fewer than the names and additions left.
 */
export function takenOutOfRoom(
  { headcount, headcountNames, headcountInvites = [] }: Headcount,
  who: { inviteId: string; name: string | null } | { name: string },
): HeadcountChange | null {
  if ('inviteId' in who) {
    if (!headcountInvites.includes(who.inviteId)) return null;
    const invites = headcountInvites.filter((id) => id !== who.inviteId);
    const names = withoutName(headcountNames, who.name);
    return { count: Math.max(names.length, invites.length, headcount - 1), names, invites };
  }
  if (!headcountNames.includes(who.name)) return null;
  const names = withoutName(headcountNames, who.name);
  return {
    count: Math.max(names.length, headcountInvites.length, headcount - 1),
    names,
    invites: headcountInvites,
  };
}

/** A name as compared for people counted twice: any case and spacing */
const sameName = (name: string | null | undefined) =>
  name?.trim().replace(/\s+/g, ' ').toLowerCase() ?? '';

/** Someone counted in the room who is here as a member too, and how to take them out */
export interface CountedTwice {
  /** The member's name */
  name: string;
  /** What to take out of the headcount: their addition, or the name counted */
  who: { inviteId: string; name: string | null } | { name: string };
}

/**
 * People in the headcount who are now here as members (on a device, or marked present): counted
 * in the room before they signed in, so counted twice until the chair takes them out. Found by
 * the addition they joined by, or by name (theirs, or the addition's), in any case and spacing.
 */
export function countedTwice(
  members: Member[],
  roster: MeetingRoster | null,
  { headcountNames, headcountInvites = [] }: Headcount,
): CountedTwice[] {
  const joinedBy = new Map(
    (roster?.members ?? []).map((m) => [m.userId, { id: m.inviteId, name: m.inviteName }]),
  );
  const found: CountedTwice[] = [];
  for (const member of members) {
    if (member.role === 'guest' || !member.present) continue;
    const invite = joinedBy.get(member.id);
    if (invite?.id && headcountInvites.includes(invite.id)) {
      found.push({ name: member.name, who: { inviteId: invite.id, name: invite.name ?? null } });
      continue;
    }
    const names = [sameName(member.name), sameName(invite?.name)].filter(Boolean);
    const counted = headcountNames.find((n) => names.includes(sameName(n)));
    if (counted) found.push({ name: member.name, who: { name: counted } });
  }
  return found;
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
