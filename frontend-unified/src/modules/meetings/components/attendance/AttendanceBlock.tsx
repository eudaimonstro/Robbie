import type { AttendanceSummary } from '@robbie-bylawyer/shared/utils';
import { quorumLine } from '../../utils/attendance';

interface AttendanceBlockProps {
  summary: AttendanceSummary;
  /** The voting members quorum is counted against; null while unknown */
  eligible: number | null;
  /** In a console panel, or on the display at 1080p */
  size?: 'panel' | 'display';
}

/**
 * Attendance you can read from the door (docs/design-brief.md): present, quorum and eligible in
 * Fraunces with labels beneath, and a line saying whether quorum is met
 */
export function AttendanceBlock({ summary, eligible, size = 'panel' }: AttendanceBlockProps) {
  const display = size === 'display';
  const figures = [
    { label: 'Present', value: String(summary.present) },
    { label: 'Quorum', value: String(summary.quorum) },
    { label: 'Eligible', value: eligible === null ? '-' : String(eligible) },
  ];
  return (
    <div>
      <dl className={`grid grid-cols-3 ${display ? 'gap-10' : 'gap-4'}`}>
        {figures.map((figure) => (
          <div key={figure.label} className="flex flex-col-reverse">
            <dt
              className={
                display
                  ? 'text-display-label font-semibold uppercase tracking-[0.08em] text-ink-muted'
                  : 'label-caps'
              }
            >
              {figure.label}
            </dt>
            <dd
              className={`font-serif-soft font-semibold tabular-nums text-ink ${display ? 'text-display-number' : 'text-page'}`}
            >
              {figure.value}
            </dd>
          </div>
        ))}
      </dl>
      <p
        className={`mt-2 font-semibold ${summary.hasQuorum ? 'text-carried' : 'text-caution-ink'} ${display ? 'text-display-line' : 'text-sm'}`}
      >
        {quorumLine(summary)}
      </p>
      {/* The room can check the paper count apart from the people it can see (the console
          says it in its own line) */}
      {display && summary.proxiesHeld > 0 && (
        <p className="mt-1 text-display-label tabular-nums text-ink-muted">
          {summary.present - summary.proxiesHeld} here, {summary.proxiesHeld} by proxy or absentee
          ballot
        </p>
      )}
    </div>
  );
}
