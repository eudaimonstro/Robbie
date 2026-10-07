import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { TimerLine } from '../TimerLine';

describe('TimerLine', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down in tabular numerals over a caution line that shortens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T19:00:00'));
    render(<TimerLine endTime={Date.now() + 90_000} totalSeconds={180} label="Speaking time" />);
    expect(screen.getByRole('timer', { name: 'Speaking time: 1:30 left' })).toBeTruthy();
    expect(screen.getByTestId('timer-bar').style.width).toBe('50%');

    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(screen.getByText('Time is up')).toBeTruthy();
  });

  it('shows nothing without a timer', () => {
    const { container } = render(<TimerLine endTime={null} totalSeconds={180} label="Voting" />);
    expect(container.textContent).toBe('');
  });
});
