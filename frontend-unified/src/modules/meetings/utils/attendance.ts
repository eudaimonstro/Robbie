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
      const name = member?.name ?? person.name ?? person.email.split('@')[0];
      return { userId: person.userId, name, status };
    })
    .sort((a, b) => byName.compare(a.name, b.name));
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
