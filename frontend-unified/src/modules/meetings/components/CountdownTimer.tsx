import React, { useState, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';
import type { CountdownTimerProps } from '../types';

export const CountdownTimer = React.memo(function CountdownTimer({
  endTime,
  label,
  onExpired,
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    if (!endTime) {
      hasExpiredRef.current = false;
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimeLeft(remaining);

      // Call onExpired callback once when timer reaches zero
      if (remaining === 0 && !hasExpiredRef.current && onExpired) {
        hasExpiredRef.current = true;
        onExpired();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [endTime, onExpired]);

  if (!endTime) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isExpired = timeLeft === 0;
  const isWarning = timeLeft <= 30 && timeLeft > 0;

  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const statusText = isExpired ? 'Time expired' : isWarning ? 'Warning, time running low' : '';

  return (
    <div
      className={`flex items-center gap-2 p-3 rounded-lg border-2 ${
        isExpired
          ? 'bg-gavel-tint border-gavel/30 text-ink'
          : isWarning
            ? 'bg-caution-tint border-caution/40 text-ink'
            : 'bg-gavel-tint border-rule text-ink'
      }`}
      role="timer"
      aria-label={`${label}: ${timeDisplay} remaining${statusText ? `. ${statusText}` : ''}`}
      aria-live="polite"
    >
      <Clock size={18} aria-hidden="true" />
      <div>
        <p className="text-xs font-medium uppercase">{label}</p>
        <p className="text-2xl font-bold font-mono" aria-hidden="true">
          {timeDisplay}
        </p>
      </div>
      {isExpired && <span className="ml-auto font-semibold">TIME EXPIRED</span>}
    </div>
  );
});
