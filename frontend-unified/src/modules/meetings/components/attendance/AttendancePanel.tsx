import { useId, useMemo, useState } from 'react';
import { generateTimestamp, type AttendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import type { MeetingRoster } from '../../../../api/client';
import { PresenceBadge } from '../../../../components/ui/Badge';
import { rosterRows, type RosterRow, type RosterStatus } from '../../utils/attendance';
import { AttendanceBlock } from './AttendanceBlock';
import { HeadcountForm } from './HeadcountForm';

interface AttendancePanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  summary: AttendanceSummary;
  roster: MeetingRoster | null;
  rosterError: string | null;
  eligible: number | null;
}

/**
 * The chair's attendance panel: the three numbers, the organization's voting members with how
 * each is here (and Mark present or Mark absent), the headcount of people without an account,
 * and the guests
 */
export function AttendancePanel({
  state,
  dispatch,
  summary,
  roster,
  rosterError,
  eligible,
}: AttendancePanelProps) {
  const findId = useId();
  const [find, setFind] = useState('');
  const rows = useMemo(
    () => (roster ? rosterRows(roster, state.members) : []),
    [roster, state.members],
  );
  const query = find.trim().toLowerCase();
  const shown = query ? rows.filter((row) => row.name.toLowerCase().includes(query)) : rows;
  const guests = state.members.filter((m) => m.role === 'guest' && m.present);

  const markPresent = (row: RosterRow) =>
    dispatch({ type: 'MARK_PRESENT', userId: row.userId, timestamp: generateTimestamp() });
  const markAbsent = (row: RosterRow) =>
    dispatch({
      type: 'MARK_ABSENT',
      memberId: row.userId,
      excused: false,
      timestamp: generateTimestamp(),
    });

  return (
    <section className="card space-y-5 p-5" aria-labelledby="attendance-heading">
      <h3 id="attendance-heading" className="label-caps">
        Attendance
      </h3>
      <AttendanceBlock summary={summary} eligible={eligible} />
      <p className="text-xs tabular-nums text-ink-muted">
        {summary.devicePresent} on a device, {summary.markedPresent} marked present,{' '}
        {summary.headcount} counted in the room
        {summary.proxies > 0 && `, ${summary.proxies} by proxy`}
      </p>

      {/* Keyed on what the meeting has, so a change from another console resets the form */}
      <HeadcountForm
        key={`${state.headcount}|${state.headcountNames.join('\n')}`}
        headcount={state.headcount}
        names={state.headcountNames}
        dispatch={dispatch}
      />

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
            {shown.map((row) => (
              <li key={row.userId} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                  <StatusBadge status={row.status} />
                </div>
                <RowAction row={row} onMarkPresent={markPresent} onMarkAbsent={markAbsent} />
              </li>
            ))}
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
