import { useId, useState, type FormEvent } from 'react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { HeadcountBase, MeetingAction } from '@robbie-bylawyer/shared/types';
import { useToast } from '../../../../context/ToastContext';

interface HeadcountFormProps {
  /** The meeting's counts now */
  headcount: number;
  names: string[];
  proxiesHeld: number;
  /** People added by email counted in the room: the headcount includes them */
  invitesCounted: number;
  /** The meeting's counts as SET_HEADCOUNT's base (what a save was made from) */
  base: HeadcountBase;
  /** The organization's voting members: no more proxies than that */
  eligible: number | null;
  dispatch: (action: MeetingAction) => Promise<boolean> | void;
}

/** A count as typed: a whole number, 0 or more (empty is 0), or null */
const countOf = (text: string): number | null => {
  const trimmed = text.trim() || '0';
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
};

/**
 * What the form holds while someone is changing it, and the counts they started from (null: the
 * meeting's when they save, after they were told the counts had changed)
 */
interface Draft {
  count: string;
  names: string;
  proxies: string;
  from: HeadcountBase | null;
}

/**
 * People in the room without an account: how many, and their names when they want them in the
 * minutes; and the paper proxies and absentee ballots held, which count toward quorum too.
 * Saving replaces them (SET_HEADCOUNT). Untouched, the form shows the meeting's counts as they
 * change; once someone types, it keeps what they typed (another screen's Mark present doesn't
 * wipe it), and a save made from counts that changed meanwhile is refused and said so.
 */
export function HeadcountForm({
  headcount,
  names,
  proxiesHeld,
  invitesCounted,
  base,
  eligible,
  dispatch,
}: HeadcountFormProps) {
  const countId = useId();
  const namesId = useId();
  const proxiesId = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const shown = draft ?? {
    count: String(headcount),
    names: names.join('\n'),
    proxies: String(proxiesHeld),
    from: base,
  };
  const edit = (change: Partial<Omit<Draft, 'from'>>) => setDraft({ ...shown, ...change });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = countOf(shown.count);
    if (value === null) {
      setProblem('The headcount is a whole number, 0 or more');
      return;
    }
    const held = countOf(shown.proxies);
    if (held === null) {
      setProblem('The proxies and absentee ballots held are a whole number, 0 or more');
      return;
    }
    if (eligible !== null && held > eligible) {
      setProblem(
        `The proxies and absentee ballots held can't be more than the ${eligible} voting members`,
      );
      return;
    }
    const list = shown.names
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    if (list.length > value) {
      setProblem('Give at most one name for each person counted');
      return;
    }
    if (value < invitesCounted) {
      setProblem(
        `The headcount includes the ${invitesCounted} people added by email counted in the room`,
      );
      return;
    }
    setProblem(null);
    setSaving(true);
    const taken = await dispatch({
      type: 'SET_HEADCOUNT',
      count: value,
      names: list,
      proxiesHeld: held,
      base: shown.from ?? base,
      timestamp: generateTimestamp(),
    });
    setSaving(false);
    if (taken === false) {
      // Another screen changed the counts since this one was typed from: keep what was typed,
      // say what the meeting has now, and save from that next time
      setDraft({ ...shown, from: null });
      setProblem(
        'The counts changed on another screen (they are above). Check yours and save again.',
      );
      return;
    }
    setDraft(null);
    showToast('success', 'Headcount saved');
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
      {/* The two counts side by side, so the roster stays near the top of the console */}
      <div className="grid grid-cols-2 items-end gap-3">
        <div>
          <label htmlFor={countId} className="label">
            Headcount
          </label>
          <input
            id={countId}
            className="input tabular-nums"
            inputMode="numeric"
            value={shown.count}
            onChange={(e) => edit({ count: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor={proxiesId} className="label">
            Proxies and absentee ballots held
          </label>
          <input
            id={proxiesId}
            className="input tabular-nums"
            inputMode="numeric"
            value={shown.proxies}
            onChange={(e) => edit({ proxies: e.target.value })}
          />
        </div>
      </div>
      <p className="text-xs text-ink-muted">
        The headcount is people in the room without an account. Paper proxies and absentee ballots
        handed in for owners who aren&apos;t here count toward quorum too.
      </p>
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
            value={shown.names}
            onChange={(e) => edit({ names: e.target.value })}
          />
        </div>
      </details>
      {problem && (
        <p role="alert" className="text-sm text-gavel">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-secondary btn-sm" disabled={saving}>
          Save the headcount
        </button>
        {draft && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              setDraft(null);
              setProblem(null);
            }}
          >
            Undo my changes
          </button>
        )}
      </div>
    </form>
  );
}
