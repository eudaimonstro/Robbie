import { useId } from 'react';
import { peopleFor, type QuorumDraft } from './quorumDraft';

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
