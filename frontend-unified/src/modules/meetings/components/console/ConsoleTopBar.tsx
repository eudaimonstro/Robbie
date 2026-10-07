import { useEffect, useState } from 'react';
import { Monitor, QrCode as QrCodeIcon } from 'lucide-react';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import type { AttendanceSummary } from '@robbie-bylawyer/shared/utils';
import { attendanceChip } from '../../utils/attendance';
import { stageLabel } from '../../utils/question';
import { ConnectionStatus } from '../ConnectionStatus';

interface ConsoleTopBarProps {
  state: MeetingState;
  attendance: AttendanceSummary;
  eligible: number | null;
  /** When the meeting was called to order (the packet's startedAt) */
  startedAt: string | null;
  meetingCode: string;
  onJoinInfo: () => void;
}

/** Hours and minutes since the call to order ("1:05"), checked every 30 seconds */
function useElapsed(startedAt: string | null, running: boolean): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || !running) return;
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, [startedAt, running]);

  if (!startedAt || !running) return null;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;
  const minutes = Math.max(0, Math.floor((now - started) / 60_000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * The console's 56px top bar: the meeting's title, its stage, the time since the call to order,
 * attendance in one chip, and the Display and Join info buttons
 */
export function ConsoleTopBar({
  state,
  attendance,
  eligible,
  startedAt,
  meetingCode,
  onJoinInfo,
}: ConsoleTopBarProps) {
  const elapsed = useElapsed(startedAt, state.meetingActive);
  return (
    <header className="card flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
      <h2 className="min-w-0 truncate font-serif-soft text-title font-semibold text-ink">
        {state.title || 'Live meeting'}
      </h2>
      <span className="label-caps">{stageLabel(state)}</span>
      {elapsed && <span className="text-sm tabular-nums text-ink-muted">{elapsed} elapsed</span>}
      <span
        className={`rounded-full px-3 py-1 text-sm font-medium tabular-nums text-ink ${attendance.hasQuorum ? 'bg-carried-tint' : 'bg-caution-tint'}`}
      >
        {attendanceChip(attendance, eligible)}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {/* A window of its own, to drag to the TV or projector */}
        <a
          href={`/meetings/${meetingCode}/display`}
          target="_blank"
          rel="noopener"
          className="btn-secondary btn-sm"
        >
          <Monitor className="h-5 w-5" aria-hidden="true" />
          Display
        </a>
        <button type="button" className="btn-secondary btn-sm" onClick={onJoinInfo}>
          <QrCodeIcon className="h-5 w-5" aria-hidden="true" />
          Join info
        </button>
        <ConnectionStatus />
      </div>
    </header>
  );
}
