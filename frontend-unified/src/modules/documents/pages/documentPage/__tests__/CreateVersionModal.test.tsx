import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CreateVersionModal } from '../DocumentModals';

function renderModal() {
  const onSubmit = vi.fn(async () => {});
  render(<CreateVersionModal isOpen onClose={() => {}} onSubmit={onSubmit} />);
  return onSubmit;
}

describe('CreateVersionModal', () => {
  it('submits the effective date and notes', async () => {
    const onSubmit = renderModal();
    fireEvent.change(screen.getByLabelText(/Effective date/), { target: { value: '2026-04-01' } });
    fireEvent.change(screen.getByLabelText(/Notes/), {
      target: { value: 'Adopted at the annual meeting' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create version' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        effectiveDate: '2026-04-01',
        notes: 'Adopted at the annual meeting',
      }),
    );
  });

  it('leaves the effective date out when none is entered', async () => {
    const onSubmit = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Create version' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ effectiveDate: undefined, notes: undefined }),
    );
  });
});
