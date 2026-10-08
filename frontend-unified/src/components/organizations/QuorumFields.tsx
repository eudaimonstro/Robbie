import { useId } from 'react';
import type { Organization } from '../../api/client';

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
function peopleFor(draft: QuorumDraft): number | null {
  if (draft.kind !== 'percent') return null;
  const voters = wholeNumber(draft.voters);
  const percent = wholeNumber(draft.quorum);
  if (!voters || !percent || percent > 100) return null;
  return Math.max(1, Math.ceil((voters * percent) / 100));
}

/**
 * How many voting members the organization has and its quorum, with plain help: the same
 * fields when an organization is created, in Settings and on the setup checklist
 */
export function QuorumFields({
  value,
  onChange,
}: {
  value: QuorumDraft;
  onChange: (draft: QuorumDraft) => void;
}) {
  const id = useId();
  const votersId = `${id}-voters`;
  const quorumId = `${id}-quorum`;
  const people = peopleFor(value);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={votersId} className="label">
          Voting members
        </label>
        <input
          id={votersId}
          className="input w-32 tabular-nums"
          inputMode="numeric"
          value={value.voters}
          aria-describedby={`${votersId}-help`}
          onChange={(e) => onChange({ ...value, voters: e.target.value })}
        />
        <p id={`${votersId}-help`} className="mt-1 text-xs text-ink-muted">
          How many homes or lots vote (142, say), whether or not their owners use Robbie.
        </p>
      </div>
      <fieldset className="space-y-2" aria-describedby={`${quorumId}-help`}>
        <legend className="label">Quorum</legend>
        <p id={`${quorumId}-help`} className="text-xs text-ink-muted">
          From your bylaws: how many must be present, in person or by proxy, for a meeting to do
          business.
        </p>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="radio"
            name={`${id}-kind`}
            className="accent-gavel"
            checked={value.kind === 'percent'}
            onChange={() => onChange({ ...value, kind: 'percent' })}
          />
          A percentage of the voting members
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="radio"
            name={`${id}-kind`}
            className="accent-gavel"
            checked={value.kind === 'count'}
            onChange={() => onChange({ ...value, kind: 'count' })}
          />
          A number of people
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={quorumId} className="sr-only">
            {value.kind === 'percent' ? 'Quorum percentage' : 'Quorum count'}
          </label>
          <input
            id={quorumId}
            className="input w-32 tabular-nums"
            inputMode="numeric"
            value={value.quorum}
            onChange={(e) => onChange({ ...value, quorum: e.target.value })}
          />
          <span className="text-sm text-ink-muted">
            {value.kind === 'percent' ? '%' : 'people'}
            {people !== null && `, which is ${people} ${people === 1 ? 'person' : 'people'}`}
          </span>
        </div>
      </fieldset>
    </div>
  );
}
