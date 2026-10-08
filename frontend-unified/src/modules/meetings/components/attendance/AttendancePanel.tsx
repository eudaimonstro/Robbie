import { useEffect, useId, useMemo, useState } from 'react';
import { generateTimestamp, type AttendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import type { MeetingRoster } from '../../../../api/client';
import { PresenceBadge } from '../../../../components/ui/Badge';
import {
  countedInRoom,
  countedTwice,
  inviteRows,
  rosterRows,
  takenOutOfRoom,
  type InviteRow,
  type RosterRow,
  type RosterStatus,
} from '../../utils/attendance';
import { AttendanceBlock } from './AttendanceBlock';
import { HeadcountForm } from './HeadcountForm';

interface AttendancePanelProps {
  state: MeetingState;
  /** The meeting's dispatch: the answer says whether the server took the action */
  dispatch: (action: MeetingAction) => Promise<boolean> | void;
  summary: AttendanceSummary;
  roster: MeetingRoster | null;
  rosterError: string | null;
  eligible: number | null;
  /** After the adjournment: the record of who was here, with nothing to change */
  readOnly?: boolean;
}

/** A row of the roster: a member with an account, or someone added by email not yet signed in */
type Entry = { kind: 'member'; row: RosterRow } | { kind: 'invite'; row: InviteRow };

const nameOf = (entry: Entry) => (entry.kind === 'member' ? entry.row.name : entry.row.label);
const byName = new Intl.Collator(undefined, { sensitivity: 'base' });

/** How long a change to the headcount may take to come back before the buttons free up anyway */
const HEADCOUNT_WAIT_MS = 5000;

/**
 * The chair's attendance panel: the three numbers, the organization's voting members with how
 * each is here (and Mark present or Mark absent), the people added by email who haven't signed
 * in (counted in the room by name), the headcount of people without an account and the proxies
 * held, and the guests
 */
export function AttendancePanel({
  state,
  dispatch,
  summary,
  roster,
  rosterError,
  eligible,
  readOnly = false,
}: AttendancePanelProps) {
  const findId = useId();
  const [find, setFind] = useState('');
  // A headcount change sent and not yet back: SET_HEADCOUNT replaces the count and the names, so
  // the next one waits for it, or two quick taps would lose one
  const [sent, setSent] = useState<{ count: number; names: string[] } | null>(null);
  const headcountNow = `${state.headcount}|${state.headcountNames.join('\n')}`;
  useEffect(() => {
    if (!sent) return;
    if (`${sent.count}|${sent.names.join('\n')}` === headcountNow) {
      setSent(null);
      return;
    }
    const timer = setTimeout(() => setSent(null), HEADCOUNT_WAIT_MS);
    return () => clearTimeout(timer);
  }, [sent, headcountNow]);

  const entries = useMemo<Entry[]>(() => {
    if (!roster) return [];
    const members = rosterRows(roster, state.members).map((row) => ({
      kind: 'member' as const,
      row,
    }));
    const invites = inviteRows(roster, state.headcountNames).map((row) => ({
      kind: 'invite' as const,
      row,
    }));
    return [...members, ...invites].sort((a, b) => byName.compare(nameOf(a), nameOf(b)));
  }, [roster, state.members, state.headcountNames]);
  const query = find.trim().toLowerCase();
  const shown = query
    ? entries.filter((entry) => nameOf(entry).toLowerCase().includes(query))
    : entries;
  const guests = state.members.filter((m) => m.role === 'guest' && m.present);
  const twice = countedTwice(state.members, state.headcountNames);

  const markPresent = (row: RosterRow) =>
    dispatch({ type: 'MARK_PRESENT', userId: row.userId, timestamp: generateTimestamp() });
  const markAbsent = (row: RosterRow) =>
    dispatch({
      type: 'MARK_ABSENT',
      memberId: row.userId,
      excused: false,
      timestamp: generateTimestamp(),
    });
  /** Replace the headcount (the proxies held stay as they are) and wait for it to come back */
  const setHeadcount = async (next: { count: number; names: string[] }) => {
    setSent(next);
    const taken = await dispatch({
      type: 'SET_HEADCOUNT',
      count: next.count,
      names: next.names,
      timestamp: generateTimestamp(),
    });
    if (taken === false) setSent(null);
  };

  return (
    <section className="card space-y-5 p-5" aria-labelledby="attendance-heading">
      <h3 id="attendance-heading" className="label-caps">
        Attendance
      </h3>
      <AttendanceBlock summary={summary} eligible={eligible} />
      <p className="text-xs tabular-nums text-ink-muted">
        {summary.devicePresent} on a device, {summary.markedPresent} marked present,{' '}
        {summary.headcount} counted in the room
        {summary.proxiesHeld > 0 && `, ${summary.proxiesHeld} by proxy or absentee ballot`}
        {summary.proxies > 0 && `, ${summary.proxies} by proxy`}
      </p>

      {!readOnly &&
        twice.map((name) => (
          <div
            key={name}
            role="status"
            className="space-y-2 rounded-lg bg-caution-tint px-3 py-2 text-sm text-caution-ink"
          >
            <p>{name} is counted in the room and is now here on a device.</p>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={sent !== null}
              onClick={() => void setHeadcount(takenOutOfRoom(state, name))}
            >
              Take {name} out of the headcount
            </button>
          </div>
        ))}

      {/* Keyed on what the meeting has, so a change from another console resets the form */}
      {!readOnly && (
        <HeadcountForm
          key={`${headcountNow}|${state.proxiesHeld ?? 0}`}
          headcount={state.headcount}
          names={state.headcountNames}
          proxiesHeld={state.proxiesHeld ?? 0}
          dispatch={dispatch}
        />
      )}

      <div className="space-y-2">
        <label htmlFor={findId} className="label">
          Find a member
        </label>
        <input
          id={findId}
          className="input"
          value={find}
          onChange={(e) => setFind(e.target.value)}
        />
        {rosterError ? (
          <p role="alert" className="text-sm text-gavel">
            {rosterError}
          </p>
        ) : !roster ? (
          <p className="text-sm text-ink-muted">Loading the roster...</p>
        ) : (
          <ul
            aria-label="Voting members"
            className="max-h-64 divide-y divide-rule overflow-y-auto scrollbar-thin"
          >
            {shown.map((entry) =>
              entry.kind === 'member' ? (
                <li key={entry.row.userId} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium text-ink">{entry.row.name}</p>
                    <StatusBadge status={entry.row.status} />
                  </div>
                  {!readOnly && (
                    <RowAction
                      row={entry.row}
                      onMarkPresent={markPresent}
                      onMarkAbsent={markAbsent}
                    />
                  )}
                </li>
              ) : (
                <li
                  key={entry.row.inviteId}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium text-ink">{entry.row.label}</p>
                    {entry.row.status === 'counted' ? (
                      <span className="block text-xs text-carried">Counted in the room</span>
                    ) : (
                      <span className="block text-xs text-ink-muted">Added, not yet signed in</span>
                    )}
                  </div>
                  {!readOnly && entry.row.markable && (
                    <InviteAction
                      row={entry.row}
                      disabled={sent !== null}
                      onCount={() => void setHeadcount(countedInRoom(state, entry.row.label))}
                      onTakeOut={() => void setHeadcount(takenOutOfRoom(state, entry.row.label))}
                    />
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {guests.length > 0 && (
        <div className="space-y-2">
          <h4 className="label-caps">Guests ({guests.length})</h4>
          <ul aria-label="Guests" className="flex flex-wrap gap-2">
            {guests.map((guest) => (
              <li key={guest.id} className="badge-guest">
                {guest.name}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">
            Guests follow the meeting and may ask to speak. They don&apos;t vote or count toward
            quorum.
          </p>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: RosterStatus }) {
  if (status === 'connected') return <PresenceBadge presence="present" />;
  if (status === 'marked') return <PresenceBadge presence="marked" />;
  if (status === 'absent') return <PresenceBadge presence="absent" />;
  return <span className="block text-xs text-ink-muted">Not joined</span>;
}

function RowAction({
  row,
  onMarkPresent,
  onMarkAbsent,
}: {
  row: RosterRow;
  onMarkPresent: (row: RosterRow) => void;
  onMarkAbsent: (row: RosterRow) => void;
}) {
  if (row.status === 'connected') {
    // The server refuses it (MEMBER_CONNECTED): their phone says they are in the room
    return (
      <button
        type="button"
        className="btn-ghost btn-sm"
        disabled
        title="Their device is connected, so they are here"
        aria-label={`Mark ${row.name} absent`}
      >
        Mark absent
      </button>
    );
  }
  if (row.status === 'marked') {
    return (
      <button
        type="button"
        className="btn-ghost btn-sm"
        onClick={() => onMarkAbsent(row)}
        aria-label={`Mark ${row.name} absent`}
      >
        Mark absent
      </button>
    );
  }
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={() => onMarkPresent(row)}
      aria-label={`Mark ${row.name} present`}
    >
      Mark present
    </button>
  );
}

/** Someone added by email, not yet signed in: counted in the room by name, or taken out */
function InviteAction({
  row,
  disabled,
  onCount,
  onTakeOut,
}: {
  row: InviteRow;
  disabled: boolean;
  onCount: () => void;
  onTakeOut: () => void;
}) {
  return row.status === 'counted' ? (
    <button
      type="button"
      className="btn-ghost btn-sm"
      disabled={disabled}
      onClick={onTakeOut}
      aria-label={`Mark ${row.label} absent`}
    >
      Mark absent
    </button>
  ) : (
    <button
      type="button"
      className="btn-secondary btn-sm"
      disabled={disabled}
      onClick={onCount}
      aria-label={`Mark ${row.label} present`}
    >
      Mark present
    </button>
  );
}
