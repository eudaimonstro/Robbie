import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  generateTimestamp,
  headcountBaseOf,
  type AttendanceSummary,
} from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import type { MeetingRoster } from '../../../../api/client';
import { PresenceBadge } from '../../../../components/ui/Badge';
import {
  countedInRoom,
  countedTwice,
  inviteRows,
  rosterRows,
  takenOutOfRoom,
  type HeadcountChange,
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

/** How many times a tap counts again after another screen changed the counts first */
const TRIES = 3;
/** How long to wait for the meeting's new counts after such a refusal */
const FRESH_COUNTS_MS = 3000;

/** The meeting's counts in one string, to see whether they moved */
const countsKey = (state: MeetingState) => JSON.stringify(headcountBaseOf(state));

/**
 * The chair's attendance panel: the three numbers, then the roster (the main thing the chair
 * does here: find a name, Mark present), with the organization's voting members and the people
 * added by email who haven't signed in (counted in the room), then the headcount of people
 * without an account and the proxies held, and the guests
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
  // A tap's change on its way: the next waits for it
  const [busy, setBusy] = useState(false);
  // The meeting as it is now, for a change counted again after a refusal
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  const entries = useMemo<Entry[]>(() => {
    if (!roster) return [];
    const members = rosterRows(roster, state.members).map((row) => ({
      kind: 'member' as const,
      row,
    }));
    const invites = inviteRows(roster, state.headcountInvites ?? []).map((row) => ({
      kind: 'invite' as const,
      row,
    }));
    return [...members, ...invites].sort((a, b) => byName.compare(nameOf(a), nameOf(b)));
  }, [roster, state.members, state.headcountInvites]);
  const query = find.trim().toLowerCase();
  const shown = query
    ? entries.filter((entry) => nameOf(entry).toLowerCase().includes(query))
    : entries;
  const guests = state.members.filter((m) => m.role === 'guest' && m.present);
  const twice = countedTwice(state.members, roster, state);

  const markPresent = (row: RosterRow) =>
    dispatch({ type: 'MARK_PRESENT', userId: row.userId, timestamp: generateTimestamp() });
  const markAbsent = (row: RosterRow) =>
    dispatch({
      type: 'MARK_ABSENT',
      memberId: row.userId,
      excused: false,
      timestamp: generateTimestamp(),
    });

  /**
   * Change the headcount (the proxies held stay as they are), made from the meeting's counts as
   * this screen has them. Another screen may have changed them first: the server refuses it
   * (HEADCOUNT_CHANGED), the meeting's new counts arrive, and the change is made again from
   * them, so no tap on either screen is lost.
   */
  const changeHeadcount = async (make: (now: MeetingState) => HeadcountChange | null) => {
    setBusy(true);
    try {
      for (let tries = 0; tries < TRIES; tries++) {
        const now = latest.current;
        const next = make(now);
        if (!next) return;
        const taken = await dispatch({
          type: 'SET_HEADCOUNT',
          count: next.count,
          names: next.names,
          invites: next.invites,
          base: headcountBaseOf(now),
          timestamp: generateTimestamp(),
        });
        if (taken !== false) return;
        // Refused: wait for the meeting's counts to move on, then count again from them
        const before = countsKey(now);
        const until = Date.now() + FRESH_COUNTS_MS;
        while (countsKey(latest.current) === before && Date.now() < until) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if (countsKey(latest.current) === before) return;
      }
    } finally {
      setBusy(false);
    }
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
        twice.map(({ name, who }) => (
          <div
            key={name}
            role="status"
            className="space-y-2 rounded-lg bg-caution-tint px-3 py-2 text-sm text-caution-ink"
          >
            <p>{name} is counted in the room and is now here as a member.</p>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={busy}
              onClick={() => void changeHeadcount((now) => takenOutOfRoom(now, who))}
            >
              Take {name} out of the headcount
            </button>
          </div>
        ))}

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
                  {!readOnly && (
                    <InviteAction
                      row={entry.row}
                      disabled={busy}
                      onCount={() => void changeHeadcount((now) => countedInRoom(now, entry.row))}
                      onTakeOut={() =>
                        void changeHeadcount((now) => takenOutOfRoom(now, entry.row))
                      }
                    />
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {!readOnly && (
        <HeadcountForm
          headcount={state.headcount}
          names={state.headcountNames}
          proxiesHeld={state.proxiesHeld ?? 0}
          invitesCounted={(state.headcountInvites ?? []).length}
          base={headcountBaseOf(state)}
          eligible={eligible}
          dispatch={dispatch}
        />
      )}

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
