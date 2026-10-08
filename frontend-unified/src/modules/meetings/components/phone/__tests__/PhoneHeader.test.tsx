import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PhoneHeader } from '../PhoneHeader';

afterEach(cleanup);

describe('PhoneHeader', () => {
  it('asks before a member leaves a meeting in session, and stays on Stay', () => {
    const onLeave = vi.fn();
    render(
      <PhoneHeader
        title="Annual meeting"
        item={null}
        guest={false}
        onLeave={onLeave}
        confirmLeave
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Leave meeting' }));
    expect(screen.getByText('Leave the meeting?')).toBeTruthy();
    expect(screen.getByText("You won't count toward the quorum.")).toBeTruthy();
    expect(onLeave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(onLeave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Leave meeting' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('leaves at once when there is nothing to lose', () => {
    const onLeave = vi.fn();
    render(<PhoneHeader title="Annual meeting" item={null} guest onLeave={onLeave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Leave meeting' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Leave the meeting?')).toBeNull();
  });
});
