import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ConfirmDialog from '../ConfirmDialog';

const props = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  title: 'Delete the draft?',
  message: 'It cannot be recovered.',
  confirmText: 'Delete',
};

describe('ConfirmDialog', () => {
  it('puts focus on Cancel when the action is dangerous', async () => {
    render(<ConfirmDialog {...props} variant="danger" />);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' })),
    );
  });

  it('puts focus on the action otherwise', async () => {
    render(<ConfirmDialog {...props} confirmText="Propose" />);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Propose' })),
    );
  });
});
