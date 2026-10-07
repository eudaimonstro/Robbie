import { useId, useState, type FormEvent } from 'react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction } from '@robbie-bylawyer/shared/types';

interface HeadcountFormProps {
  /** The meeting's headcount and names now (the form is keyed on them, so a change resets it) */
  headcount: number;
  names: string[];
  dispatch: React.Dispatch<MeetingAction>;
}

/**
 * People in the room without an account: how many, and their names when they want them in the
 * minutes. Saving replaces both (SET_HEADCOUNT).
 */
export function HeadcountForm({ headcount, names, dispatch }: HeadcountFormProps) {
  const countId = useId();
  const namesId = useId();
  const [count, setCount] = useState(String(headcount));
  const [nameText, setNameText] = useState(names.join('\n'));
  const [problem, setProblem] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(count.trim() || '0');
    if (!Number.isInteger(value) || value < 0) {
      setProblem('The headcount is a whole number, 0 or more');
      return;
    }
    const list = nameText
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    if (list.length > value) {
      setProblem('Give at most one name for each person counted');
      return;
    }
    setProblem(null);
    dispatch({ type: 'SET_HEADCOUNT', count: value, names: list, timestamp: generateTimestamp() });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor={countId} className="label">
          Headcount
        </label>
        <p className="mb-1 text-xs text-ink-muted">People in the room without an account</p>
        <input
          id={countId}
          className="input tabular-nums"
          inputMode="numeric"
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={namesId} className="label">
          Names for the minutes (optional, one per line)
        </label>
        <textarea
          id={namesId}
          className="textarea"
          rows={3}
          value={nameText}
          onChange={(e) => setNameText(e.target.value)}
        />
      </div>
      {problem && (
        <p role="alert" className="text-sm text-gavel">
          {problem}
        </p>
      )}
      <button type="submit" className="btn-secondary btn-sm">
        Save the headcount
      </button>
    </form>
  );
}
