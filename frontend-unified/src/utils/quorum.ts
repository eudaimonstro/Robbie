import { isQuorumSet, type QuorumSettings } from '@robbie-bylawyer/shared/utils';
import type { Organization } from '../api/client';

type QuorumFieldsOf = Pick<Organization, 'eligibleVoters' | 'quorumPercent' | 'quorumCount'>;

/** An organization's attendance settings, as the shared rules read them */
export function quorumSettingsOf(organization: QuorumFieldsOf): QuorumSettings {
  return {
    eligibleVoters: organization.eligibleVoters ?? null,
    quorumPercent: organization.quorumPercent ?? null,
    quorumCount: organization.quorumCount ?? null,
  };
}

/**
 * Whether the organization has set its voting members and quorum: until it has, its meetings
 * can't open (the server refuses them)
 */
export function quorumIsSet(organization: QuorumFieldsOf | null | undefined): boolean {
  return !!organization && isQuorumSet(quorumSettingsOf(organization));
}

/** The settings page's attendance card, where the voting members and quorum are set */
export const ATTENDANCE_SETTINGS = '/settings#attendance';
/** The settings page's members card, where people are added */
export const MEMBERS_SETTINGS = '/settings#members';

/** The quorum in words: "20% of the 142 voting members (29 people)", "29 people" */
export function quorumInWords(organization: QuorumFieldsOf): string {
  const { eligibleVoters, quorumPercent, quorumCount } = quorumSettingsOf(organization);
  if (quorumPercent !== null) {
    if (eligibleVoters === null) return `${quorumPercent}% of the voting members`;
    const people = Math.max(1, Math.ceil((eligibleVoters * quorumPercent) / 100));
    return `${quorumPercent}% of the ${eligibleVoters} voting members (${people} ${people === 1 ? 'person' : 'people'})`;
  }
  if (quorumCount !== null) return `${quorumCount} ${quorumCount === 1 ? 'person' : 'people'}`;
  return 'Not set';
}
