import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdjournDialog } from '../AdjournDialog';
import { SetAsideDialog } from '../SetAsideDialog';

// Neither can be undone: focus starts on the safe choice, so Enter held down on the button that
// opened the dialog doesn't adjourn or set the election aside
describe('confirmations that cannot be undone', () => {
  it('start the adjournment dialog on Keep going', async () => {
    const onAdjourn = vi.fn();
    const onKeepGoing = vi.fn();
    render(<AdjournDialog isOpen agenda={[]} onAdjourn={onAdjourn} onKeepGoing={onKeepGoing} />);
    const keepGoing = screen.getByRole('button', { name: 'Keep going' });
    await waitFor(() => expect(document.activeElement).toBe(keepGoing));
    fireEvent.click(keepGoing);
    expect(onKeepGoing).toHaveBeenCalled();
    expect(onAdjourn).not.toHaveBeenCalled();
  });

  it('start the set-aside dialog on Keep going', async () => {
    render(
      <SetAsideDialog isOpen position="Treasurer" onSetAside={vi.fn()} onKeepGoing={vi.fn()} />,
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep going' })),
    );
  });
});
