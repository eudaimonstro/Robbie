import type { Organization } from '../../api/client';

/*
 * The voting members and quorum as QuorumFields holds them, and what they come to: apart from
 * the component, so the forms that use it read them too
 */

export type QuorumKind = 'percent' | 'count';

/** The voting members and quorum as typed: text until they are read */
export interface QuorumDraft {
  voters: string;
  kind: QuorumKind;
  quorum: string;
}

/** What the fields come to: the settings to save, one way of the quorum */
export type QuorumSettingsBody =
  | { eligibleVoters: number; quorumPercent: number }
  | { eligibleVoters: number; quorumCount: number };

/** The fields for an organization's settings as they are (empty when not set) */
export function quorumDraftOf(
  organization?: Pick<Organization, 'eligibleVoters' | 'quorumPercent' | 'quorumCount'> | null,
): QuorumDraft {
  const percent = organization?.quorumPercent ?? null;
  const count = organization?.quorumCount ?? null;
  // A count with no voting members is the old default nobody chose: start from a percentage
  const voters = organization?.eligibleVoters ?? null;
  const kind: QuorumKind =
    count !== null && percent === null && voters !== null ? 'count' : 'percent';
  return {
    voters: voters === null ? '' : String(voters),
    kind,
    quorum: kind === 'percent' ? (percent === null ? '' : String(percent)) : String(count ?? ''),
  };
}

const wholeNumber = (text: string): number | null => {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
};

/** The settings the fields hold, or what is wrong with them, in words */
export function readQuorumDraft(
  draft: QuorumDraft,
): { body: QuorumSettingsBody } | { problem: string } {
  const voters = wholeNumber(draft.voters);
  if (voters === null || voters < 1) {
    return { problem: 'Give the number of voting members: a whole number, 1 or more' };
  }
  const quorum = wholeNumber(draft.quorum);
  if (draft.kind === 'percent') {
    if (quorum === null || quorum < 1 || quorum > 100) {
      return { problem: 'The quorum is a percentage from 1 to 100' };
    }
    return { body: { eligibleVoters: voters, quorumPercent: quorum } };
  }
  if (quorum === null || quorum < 1) {
    return { problem: 'The quorum is a whole number of people, 1 or more' };
  }
  if (quorum > voters) {
    return { problem: "The quorum can't be more people than the voting members" };
  }
  return { body: { eligibleVoters: voters, quorumCount: quorum } };
}

/** What a percentage comes to, in people, once both numbers are typed */
export function peopleFor(draft: QuorumDraft): number | null {
  if (draft.kind !== 'percent') return null;
  const voters = wholeNumber(draft.voters);
  const percent = wholeNumber(draft.quorum);
  if (!voters || !percent || percent > 100) return null;
  return Math.max(1, Math.ceil((voters * percent) / 100));
}
