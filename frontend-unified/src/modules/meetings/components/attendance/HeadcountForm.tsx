import { useId, useState, type FormEvent } from 'react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction } from '@robbie-bylawyer/shared/types';
import { useToast } from '../../../../context/ToastContext';

interface HeadcountFormProps {
  /** The meeting's counts now (the form is keyed on them, so a change resets it) */
  headcount: number;
  names: string[];
  proxiesHeld: number;
  dispatch: (action: MeetingAction) => unknown;
}

/** A count as typed: a whole number, 0 or more (empty is 0), or null */
const countOf = (text: string): number | null => {
  const trimmed = text.trim() || '0';
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
};

/**
 * People in the room without an account: how many, and their names when they want them in the
 * minutes; and the paper proxies and absentee ballots held, which count toward quorum too.
 * Saving replaces all three (SET_HEADCOUNT).
 */
export function HeadcountForm({ headcount, names, proxiesHeld, dispatch }: HeadcountFormProps) {
  const countId = useId();
  const namesId = useId();
  const proxiesId = useId();
  const [count, setCount] = useState(String(headcount));
  const [nameText, setNameText] = useState(names.join('\n'));
  const [proxies, setProxies] = useState(String(proxiesHeld));
  const [problem, setProblem] = useState<string | null>(null);
  const { showToast } = useToast();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = countOf(count);
    if (value === null) {
      setProblem('The headcount is a whole number, 0 or more');
      return;
    }
    const held = countOf(proxies);
    if (held === null) {
      setProblem('The proxies and absentee ballots held are a whole number, 0 or more');
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
    dispatch({
      type: 'SET_HEADCOUNT',
      count: value,
      names: list,
      proxiesHeld: held,
      timestamp: generateTimestamp(),
    });
    // The form resets to what the meeting has, so say that it was saved
    showToast('success', 'Headcount saved');
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
      {/* Closed unless there are names already, so the console's agenda stays above the fold */}
      <details open={names.length > 0} className="group">
        <summary className="cursor-pointer text-sm font-medium text-ink hover:text-gavel">
          Add names for the minutes
        </summary>
        <div className="mt-2">
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
      </details>
      <div>
        <label htmlFor={proxiesId} className="label">
          Proxies and absentee ballots held
        </label>
        <p className="mb-1 text-xs text-ink-muted">
          Paper ones handed in for owners who aren&apos;t here: they count toward quorum
        </p>
        <input
          id={proxiesId}
          className="input tabular-nums"
          inputMode="numeric"
          value={proxies}
          onChange={(e) => setProxies(e.target.value)}
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
