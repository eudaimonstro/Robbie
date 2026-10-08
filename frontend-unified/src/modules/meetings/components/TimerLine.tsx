import { useEffect, useState } from 'react';

interface TimerLineProps {
  /** When the time runs out (ms since the epoch), or null for no timer */
  endTime: number | null;
  /** The whole allowance, for the length of the line */
  totalSeconds: number;
  label: string;
  size?: 'panel' | 'display';
  /** What it says once time is up */
  expired?: string;
}

/**
 * The brief's timer: a 2px line in caution that shortens as time runs out, with the time left in
 * tabular numerals beneath it
 */
export function TimerLine({
  endTime,
  totalSeconds,
  label,
  size = 'panel',
  expired = 'Time is up',
}: TimerLineProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endTime) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  if (!endTime) return null;
  const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
  const fraction = totalSeconds > 0 ? Math.min(1, remaining / totalSeconds) : 0;
  const time = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  return (
    <div role="timer" aria-label={`${label}: ${time} left`}>
      <div className="h-0.5 w-full bg-rule">
        <div
          data-testid="timer-bar"
          className="h-0.5 bg-caution"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <p
        className={`mt-1 tabular-nums text-ink-muted ${size === 'display' ? 'text-display-label' : 'text-sm'}`}
      >
        {remaining === 0 ? expired : `${time} left`}
      </p>
    </div>
  );
}
